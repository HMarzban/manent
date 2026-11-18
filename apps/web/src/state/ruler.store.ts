// Whether the Ruler is shown: view state, off by default and kept per person; written only by interface events.

import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

const store = createStore<{ shown: boolean }>()(() => ({ shown: false }));

const read = () => store.getState().shown;

export function useRulerShown(): boolean {
  return useSyncExternalStore(store.subscribe, read, read);
}

function setShown(shown: boolean): void {
  guardWrite("ruler");
  store.setState({ shown });
}

export const rulerActions: {
  toggle(): void;
  set(shown: boolean): void;
  get(): boolean;
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  toggle: () => setShown(!read()),
  set: setShown,
  get: read,
  subscribe: (listener: () => void) => store.subscribe(() => listener()),
});
