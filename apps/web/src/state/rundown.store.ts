// The rundown commands' actions, one slot per part of the rundown that runs them, and what the commands know of the
// open rundown.
import type { CommandContext } from "@manent/commands";
import { guardWrite } from "./guard.ts";

const RUNDOWN_SLOTS = [
  "rows",
  "cells",
  "beside",
  "imports",
  "columns",
  "library",
] as const;
export type RundownSlot = (typeof RUNDOWN_SLOTS)[number];

/** A slot's actions by name; a command's handler runs one with no argument. */
export type SlotActions = Readonly<Record<string, () => void>>;

type RundownContext = NonNullable<CommandContext["rundown"]>;

const provided = new Map<RundownSlot, SlotActions>();
const contexts = new Map<string, RundownContext>();
const listeners = new Set<() => void>();

const tell = (): void => {
  for (const listener of listeners) listener();
};

export const rundownActions: {
  /** Gives `slot` its actions, in place of any it was given before. */
  provide(slot: RundownSlot, actions: SlotActions): void;
  /** The actions given to `slot`; null until they are. */
  slot(slot: RundownSlot): SlotActions | null;
  /** What the commands know of the rundown `docId`; null until it is set. */
  context(docId: string): CommandContext["rundown"];
  /** `value` null forgets the rundown. */
  setContext(docId: string, value: CommandContext["rundown"]): void;
  /** `listener` hears every `provide` and `setContext`. */
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  provide(slot: RundownSlot, actions: SlotActions) {
    provided.set(slot, actions);
    tell();
  },
  slot: (slot: RundownSlot) => provided.get(slot) ?? null,
  context: (docId: string) => contexts.get(docId) ?? null,
  setContext(docId: string, value: CommandContext["rundown"]) {
    guardWrite("rundown");
    if (value === null) contexts.delete(docId);
    else contexts.set(docId, value);
    tell();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
});
