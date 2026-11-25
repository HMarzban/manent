// Tab-local state of a timed writing sprint; not saved or synced.
import { createStore, useStore } from "zustand";

export interface ActiveSprint {
  readonly docId: string;
  readonly durationMs: number;
  readonly startedAt: number;
  readonly remainingMs: number;
  readonly startWords: number;
}

interface SprintState {
  readonly active: ActiveSprint | null;
}

const store = createStore<SprintState>(() => ({
  active: null,
}));

/** The active sprint in this tab, or null while none is running. */
export function useActiveSprint(): ActiveSprint | null {
  return useStore(store, (state) => state.active);
}

/** Whether a writing sprint is running in this tab. */
export function useSprintRunning(): boolean {
  return useStore(store, (state) => state.active !== null);
}

/** `get` is what a command's context reads; `subscribe`'s listener hears every change. */
export const sprintActions: {
  get(): boolean;
  active(): ActiveSprint | null;
  subscribe(listener: () => void): () => void;
  start(sprint: ActiveSprint): void;
  tick(remainingMs: number): void;
  stop(): void;
} = Object.freeze({
  get: () => store.getState().active !== null,
  active: () => store.getState().active,
  subscribe: (listener: () => void) => store.subscribe(listener),
  start(sprint: ActiveSprint): void {
    store.setState({ active: sprint });
  },
  tick(remainingMs: number): void {
    const current = store.getState().active;
    if (current === null) return;
    if (current.remainingMs === remainingMs) return;
    store.setState({ active: { ...current, remainingMs } });
  },
  stop(): void {
    if (store.getState().active === null) return;
    store.setState({ active: null });
  },
});
