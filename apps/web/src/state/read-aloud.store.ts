// Whether the script is being read aloud, for which document, and whether speech voices are available.
import { createStore, useStore } from "zustand";
import { hasMatchingVoice } from "../read-aloud/voices.ts";

export interface ReadAloudState {
  readonly active: boolean;
  readonly docId: string | null;
  readonly hasVoices: boolean;
}

const store = createStore<ReadAloudState>(() => ({
  active: false,
  docId: null,
  hasVoices: false,
}));

// Keep voiceschanged bound only while someone subscribes, so importing this module does nothing.
let subscriberCount = 0;
let unbindVoices: (() => void) | null = null;

function syncVoices(): void {
  const next = hasMatchingVoice("en");
  if (store.getState().hasVoices !== next) {
    store.setState({ hasVoices: next });
  }
}

function attachVoicesListener(): void {
  if (unbindVoices !== null) return;
  const synth = globalThis.speechSynthesis;
  if (synth === undefined) return;
  syncVoices();
  const onVoicesChanged = (): void => {
    syncVoices();
  };
  synth.addEventListener("voiceschanged", onVoicesChanged);
  unbindVoices = () => {
    synth.removeEventListener("voiceschanged", onVoicesChanged);
    unbindVoices = null;
  };
}

function detachVoicesListener(): void {
  if (subscriberCount > 0) return;
  unbindVoices?.();
}

/** The document currently being read aloud, or null when inactive or reading from the reader frame. */
export function useReadAloudDocId(): string | null {
  return useStore(store, (state) => (state.active ? state.docId : null));
}

/** Whether Read aloud is currently active. */
export function useReadingAloud(): boolean {
  return useStore(store, (state) => state.active);
}

/** `get` is what a command's context reads; `subscribe`'s listener hears every change. */
export const readAloudActions: {
  get(): boolean;
  docId(): string | null;
  hasVoices(): boolean;
  subscribe(listener: () => void): () => void;
  setActive(docId: string | null): void;
  setInactive(): void;
  refreshVoices(language?: string): boolean;
} = Object.freeze({
  get: () => store.getState().active,
  docId: () => (store.getState().active ? store.getState().docId : null),
  hasVoices: () => {
    const next = hasMatchingVoice("en");
    if (store.getState().hasVoices !== next) {
      store.setState({ hasVoices: next });
    }
    return next;
  },
  subscribe(listener: () => void): () => void {
    subscriberCount += 1;
    attachVoicesListener();
    const stop = store.subscribe(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      stop();
      subscriberCount = Math.max(0, subscriberCount - 1);
      detachVoicesListener();
    };
  },
  setActive(docId: string | null): void {
    store.setState({ active: true, docId });
  },
  setInactive(): void {
    const state = store.getState();
    if (!state.active && state.docId === null) return;
    store.setState({ active: false, docId: null });
  },
  refreshVoices(language = "en"): boolean {
    const next = hasMatchingVoice(language);
    if (store.getState().hasVoices !== next) {
      store.setState({ hasVoices: next });
    }
    return next;
  },
});
