// Whether the palette is open, with which filter or ask step; written only by interface events.

import type { PaletteAsk, PaletteFilter } from "@manent/ui";
import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

const store = createStore<{
  filter: PaletteFilter | null;
  ask: PaletteAsk | null;
}>()(() => ({
  filter: null,
  ask: null,
}));

const readFilter = (): PaletteFilter | null => store.getState().filter;
const readAsk = (): PaletteAsk | null => store.getState().ask;

/** The filter the palette is open with; null while it is closed. */
export function usePaletteOpen(): PaletteFilter | null {
  return useSyncExternalStore(store.subscribe, readFilter, readFilter);
}

/** The active ask step; null when closed or in normal command mode. */
export function usePaletteAsk(): PaletteAsk | null {
  return useSyncExternalStore(store.subscribe, readAsk, readAsk);
}

/** What code outside React reads of the palette. */
export const selectors: { isOpen(): boolean } = Object.freeze({
  isOpen: () => {
    const state = store.getState();
    return state.filter !== null || state.ask !== null;
  },
});

export const paletteActions: {
  open(filter: PaletteFilter): void;
  ask(ask: PaletteAsk): void;
  close(): void;
} = Object.freeze({
  open(filter: PaletteFilter) {
    guardWrite("palette");
    store.setState({ filter, ask: null });
  },
  ask(ask: PaletteAsk) {
    guardWrite("palette");
    // keep filter non-null so AppShell's usePaletteOpen() !== null sees the palette open for Escape handling
    store.setState({ filter: "all", ask });
  },
  close() {
    guardWrite("palette");
    store.setState({ filter: null, ask: null });
  },
});
