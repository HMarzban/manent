// Whether the palette is open, and with which filter; written only by interface events.

import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

export type PaletteFilter = "all" | "places";

const store = createStore<{ filter: PaletteFilter | null }>()(() => ({
  filter: null,
}));

const read = () => store.getState().filter;

/** The filter the palette is open with; null while it is closed. */
export function usePaletteOpen(): PaletteFilter | null {
  return useSyncExternalStore(store.subscribe, read, read);
}

export const paletteActions: {
  open(filter: PaletteFilter): void;
  close(): void;
} = Object.freeze({
  open(filter: PaletteFilter) {
    guardWrite("palette");
    store.setState({ filter });
  },
  close() {
    guardWrite("palette");
    store.setState({ filter: null });
  },
});
