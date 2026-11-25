// What the prompter commands know of the open rundown, and the bound Send / Send previous actions per rundown.
import type { CommandContext } from "@manent/commands";
import { guardWrite } from "./guard.ts";

export type PrompterContext = NonNullable<CommandContext["prompter"]>;

export interface PrompterBinding {
  send(): void;
  sendPrevious(): void;
  sendRow(rowId: string): void;
}

const contexts = new Map<string, PrompterContext>();
const bindings = new Map<string, PrompterBinding>();
const listeners = new Set<() => void>();

function sameContext(
  a: CommandContext["prompter"],
  b: CommandContext["prompter"],
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.canSend === b.canSend &&
    a.hasStory === b.hasStory &&
    a.sentBefore === b.sentBefore &&
    a.storyFormat === b.storyFormat &&
    a.waiting === b.waiting &&
    a.synced === b.synced
  );
}

const notify = (): void => {
  for (const listener of listeners) listener();
};

/**
 * `get` is what a command's context reads; `subscribe`'s listener hears every context change; `send`, `sendPrevious`
 * and `sendRow` invoke the bound rundown's prompter runtime.
 */
export const prompterActions: {
  get(docId: string): CommandContext["prompter"];
  subscribe(listener: () => void): () => void;
  setContext(docId: string, value: CommandContext["prompter"]): void;
  bind(docId: string, binding: PrompterBinding | null): void;
  send(docId: string): void;
  sendPrevious(docId: string): void;
  sendRow(rundownId: string, rowId: string): void;
} = Object.freeze({
  get: (docId: string) => contexts.get(docId) ?? null,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setContext(docId: string, value: CommandContext["prompter"]) {
    const prior = contexts.get(docId) ?? null;
    if (sameContext(prior, value)) return;
    guardWrite("prompter");
    if (value === null) contexts.delete(docId);
    else contexts.set(docId, value);
    notify();
  },
  bind(docId: string, binding: PrompterBinding | null) {
    if (binding === null) bindings.delete(docId);
    else bindings.set(docId, binding);
  },
  send(docId: string) {
    bindings.get(docId)?.send();
  },
  sendPrevious(docId: string) {
    bindings.get(docId)?.sendPrevious();
  },
  sendRow(rundownId: string, rowId: string) {
    bindings.get(rundownId)?.sendRow(rowId);
  },
});
