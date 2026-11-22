// How many times Where am I? was asked; written only by interface events, and heard by the document screen, which
// reads the place aloud.

import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

const store = createStore<{ asked: number }>()(() => ({ asked: 0 }));

const read = () => store.getState().asked;

/** A new number each time Where am I? is asked; 0 before the first. */
export function useWhereAsked(): number {
  return useSyncExternalStore(store.subscribe, read, read);
}

export const whereActions: { ask(): void } = Object.freeze({
  ask() {
    guardWrite("where");
    store.setState({ asked: read() + 1 });
  },
});
