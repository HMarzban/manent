// Whether the Find bar is open; written only by interface events.

import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

/** `openings` counts each opening, so opening again while open takes focus back to the field. */
export interface FindBarState {
  open: boolean;
  openings: number;
}

const store = createStore<FindBarState>()(() => ({ open: false, openings: 0 }));

const read = () => store.getState();

export function useFindBar(): FindBarState {
  return useSyncExternalStore(store.subscribe, read, read);
}

export const findActions: { open(): void; close(): void } = Object.freeze({
  open() {
    guardWrite("find");
    store.setState({ open: true, openings: read().openings + 1 });
  },
  close() {
    guardWrite("find");
    store.setState({ open: false });
  },
});
