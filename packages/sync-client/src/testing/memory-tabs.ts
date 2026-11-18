// One user's tabs in memory: a lock granted in the order it was asked for, and a channel
// that copies what it carries, both answering in a later microtask as the browser's do.
import type { LeaderPort } from "../ports/ports.ts";
import { readTabMessage } from "../tabs/messages.ts";
import type { TabMessage } from "../tabs/messages.ts";

export interface MemoryTabs {
  /** Every port of one MemoryTabs is a tab of the same user. */
  port(tabId: string): LeaderPort;
  /** The tab is gone: its lead is released, and it receives nothing more. */
  closeTab(tabId: string): void;
  /** The lead is taken from the leader, as an expired lease would be: its `onDeposed` runs, and the next campaigner is elected. */
  depose(): void;
  /** From now on that tab receives nothing: a tab that is dying. */
  dropMessagesTo(tabId: string): void;
  /** The tab that leads; null while nobody does. */
  leader(): string | null;
  /** Every posted value that reads as a message, in the order posted. */
  posted(): TabMessage[];
}

interface Candidate {
  tabId: string;
  handlers: { onElected(): void; onDeposed(): void };
}

/** A tab never hears its own message; the listeners of one tab share the copy it receives. */
export function memoryTabs(): MemoryTabs {
  const listeners = new Map<string, Set<(message: unknown) => void>>();
  const deaf = new Set<string>();
  let waiting: Candidate[] = [];
  const log: TabMessage[] = [];
  let lead: Candidate | null = null;

  const electLater = (): void => {
    void Promise.resolve().then(() => {
      if (lead !== null) return;
      const next = waiting.shift();
      if (next === undefined) return;
      lead = next;
      next.handlers.onElected();
    });
  };
  const deliver = (from: string, copy: unknown): void => {
    void Promise.resolve().then(() => {
      for (const [tabId, handlers] of listeners) {
        if (tabId === from || deaf.has(tabId)) continue;
        const received: unknown = structuredClone(copy);
        for (const handler of handlers) handler(received);
      }
    });
  };

  const port = (tabId: string): LeaderPort => ({
    tabId,
    campaign(handlers) {
      const candidate: Candidate = { tabId, handlers };
      waiting.push(candidate);
      electLater();
      return () => {
        waiting = waiting.filter((other) => other !== candidate);
        if (lead !== candidate) return;
        lead = null;
        electLater();
      };
    },
    post(message) {
      const copy: unknown = structuredClone(message);
      const read = readTabMessage(copy);
      if (read !== null) log.push(read);
      deliver(tabId, copy);
    },
    listen(handler) {
      const handlers = listeners.get(tabId) ?? new Set();
      listeners.set(tabId, handlers);
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  });

  return {
    port,
    closeTab(tabId) {
      deaf.add(tabId);
      waiting = waiting.filter((candidate) => candidate.tabId !== tabId);
      if (lead?.tabId !== tabId) return;
      lead = null;
      electLater();
    },
    depose() {
      const deposed = lead;
      if (deposed === null) return;
      lead = null;
      deposed.handlers.onDeposed();
      electLater();
    },
    dropMessagesTo(tabId) {
      deaf.add(tabId);
    },
    leader: () => lead?.tabId ?? null,
    posted: () => [...log],
  };
}
