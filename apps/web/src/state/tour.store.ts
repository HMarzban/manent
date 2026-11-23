// The Tour scenario the person opened in this tab, and the step they are on; written only by interface events.

import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

/** `step` is an index into the scenario's steps; one past the last means every step is behind the person. */
interface TourAt {
  scenarioId: string | null;
  step: number;
}

const store = createStore<TourAt>()(() => ({ scenarioId: null, step: 0 }));

/** The step the person is on in the scenario `scenarioId`; null while that scenario is not the one open. */
export function useTourStep(scenarioId: string): number | null {
  const read = (): number | null => {
    const at = store.getState();
    return at.scenarioId === scenarioId ? at.step : null;
  };
  return useSyncExternalStore(store.subscribe, read, read);
}

export const tourActions: {
  open(scenarioId: string, step: number): void;
  close(): void;
} = Object.freeze({
  open(scenarioId: string, step: number) {
    guardWrite("tour");
    store.setState({ scenarioId, step });
  },
  close() {
    guardWrite("tour");
    store.setState({ scenarioId: null, step: 0 });
  },
});
