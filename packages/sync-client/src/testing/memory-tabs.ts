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

/** What every tab of one MemoryTabs shares. */
interface Tabs {
  listeners: Map<string, Set<(message: unknown) => void>>;
  deaf: Set<string>;
  waiting: Candidate[];
  log: TabMessage[];
  lead: Candidate | null;
}

function electLater(tabs: Tabs): void {
  void Promise.resolve().then(() => {
    if (tabs.lead !== null) return;
    const next = tabs.waiting.shift();
    if (next === undefined) return;
    tabs.lead = next;
    next.handlers.onElected();
  });
}

function deliver(tabs: Tabs, from: string, copy: unknown): void {
  void Promise.resolve().then(() => {
    for (const [tabId, handlers] of tabs.listeners) {
      if (tabId === from || tabs.deaf.has(tabId)) continue;
      const received: unknown = structuredClone(copy);
      for (const handler of handlers) handler(received);
    }
  });
}

function tabPort(tabs: Tabs, tabId: string): LeaderPort {
  return {
    tabId,
    campaign(handlers) {
      const candidate: Candidate = { tabId, handlers };
      tabs.waiting.push(candidate);
      electLater(tabs);
      return () => {
        tabs.waiting = tabs.waiting.filter((other) => other !== candidate);
        if (tabs.lead !== candidate) return;
        tabs.lead = null;
        electLater(tabs);
      };
    },
    post(message) {
      const copy: unknown = structuredClone(message);
      const read = readTabMessage(copy);
      if (read !== null) tabs.log.push(read);
      deliver(tabs, tabId, copy);
    },
    listen(handler) {
      const handlers = tabs.listeners.get(tabId) ?? new Set();
      tabs.listeners.set(tabId, handlers);
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}

/** A tab never hears its own message; the listeners of one tab share the copy it receives. */
export function memoryTabs(): MemoryTabs {
  const tabs: Tabs = {
    listeners: new Map(),
    deaf: new Set(),
    waiting: [],
    log: [],
    lead: null,
  };
  return {
    port: (tabId) => tabPort(tabs, tabId),
    closeTab(tabId) {
      tabs.deaf.add(tabId);
      tabs.waiting = tabs.waiting.filter(
        (candidate) => candidate.tabId !== tabId,
      );
      if (tabs.lead?.tabId !== tabId) return;
      tabs.lead = null;
      electLater(tabs);
    },
    depose() {
      const deposed = tabs.lead;
      if (deposed === null) return;
      tabs.lead = null;
      deposed.handlers.onDeposed();
      electLater(tabs);
    },
    dropMessagesTo(tabId) {
      tabs.deaf.add(tabId);
    },
    leader: () => tabs.lead?.tabId ?? null,
    posted: () => [...tabs.log],
  };
}
