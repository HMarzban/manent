// Whether the Book formatting bar is shown: view state, on by default for manuscripts; written only by interface events.

import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

const store = createStore<{ shown: boolean }>()(() => ({ shown: true }));

const read = () => store.getState().shown;

export function useFormattingBarShown(): boolean {
  return useSyncExternalStore(store.subscribe, read, read);
}

function setShown(shown: boolean): void {
  guardWrite("formattingBar");
  store.setState({ shown });
}

export const formattingBarActions: {
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
