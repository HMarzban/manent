// Whether the palette is open, and with which filter; written only by interface events.

import type { PaletteFilter } from "@manent/ui";
import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

const store = createStore<{ filter: PaletteFilter | null }>()(() => ({
  filter: null,
}));

const read = () => store.getState().filter;

/** The filter the palette is open with; null while it is closed. */
export function usePaletteOpen(): PaletteFilter | null {
  return useSyncExternalStore(store.subscribe, read, read);
}

/** What code outside React reads of the palette. */
export const selectors: { isOpen(): boolean } = Object.freeze({
  isOpen: () => read() !== null,
});

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
