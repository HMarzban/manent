// Each document's production state, as a command's context reads it; null until production writes it.
import type { CommandContext } from "@manent/commands";
import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

type Production = CommandContext["production"];

const store = createStore<{
  byDoc: Readonly<Record<string, NonNullable<Production>>>;
}>()(() => ({ byDoc: {} }));

const read = (docId: string): Production =>
  store.getState().byDoc[docId] ?? null;

/** The production state of `docId`; null until it is set. */
export function useProductionContext(docId: string): Production {
  const get = () => read(docId);
  return useSyncExternalStore(store.subscribe, get, get);
}

/** `set` with null forgets the document. */
export const productionContextActions: {
  set(docId: string, value: Production): void;
  get(docId: string): Production;
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  set(docId: string, value: Production) {
    guardWrite("production_context");
    const others = Object.entries(store.getState().byDoc).filter(
      ([id]) => id !== docId,
    );
    store.setState({
      byDoc: Object.fromEntries(
        value === null ? others : [...others, [docId, value]],
      ),
    });
  },
  get: read,
  subscribe: (listener: () => void) => store.subscribe(() => listener()),
});
