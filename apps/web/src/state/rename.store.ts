// Which document's title is being renamed in place; written only by interface events.

import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

const store = createStore<{ docId: string | null }>()(() => ({
  docId: null,
}));

const read = () => store.getState().docId;

/** The document whose title is being renamed; null while none is. */
export function useRenaming(): string | null {
  return useSyncExternalStore(store.subscribe, read, read);
}

export const renameActions: { start(docId: string): void; stop(): void } =
  Object.freeze({
    start(docId: string) {
      guardWrite("rename");
      store.setState({ docId });
    },
    stop() {
      guardWrite("rename");
      store.setState({ docId: null });
    },
  });
