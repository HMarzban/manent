// Which dialog is open; written only by interface events.

import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

const store = createStore<{ id: string | null }>()(() => ({ id: null }));

const read = () => store.getState().id;

/** The id of the open dialog; null while none is. */
export function useOpenDialog(): string | null {
  return useSyncExternalStore(store.subscribe, read, read);
}

export const dialogActions: { open(id: string): void; close(): void } =
  Object.freeze({
    open(id: string) {
      guardWrite("dialog");
      store.setState({ id });
    },
    close() {
      guardWrite("dialog");
      store.setState({ id: null });
    },
  });
