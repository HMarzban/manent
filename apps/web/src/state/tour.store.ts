// The Tour scenario open in this tab, its active step, and transient set-up refusal; persisted per tab across reloads.

import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { TOUR_ACTIVE_KEY } from "../demo/tour-progress.ts";
import type { SetupOutcome } from "../demo/tour-setup.ts";
import type { TabStorage } from "../session.ts";
import { guardWrite } from "./guard.ts";

/** Active Tour scenario and zero-based step index. */
export interface TourActive {
  readonly scenarioId: string;
  readonly step: number;
}

export type TourRefusal = Extract<SetupOutcome, { ok: false }>["reason"];

interface TourAt {
  active: TourActive | null;
  selectedId: string | null;
  refusals: Readonly<Record<string, TourRefusal>>;
  locateNonce: number;
}

const INITIAL: TourAt = Object.freeze({
  active: null,
  selectedId: null,
  refusals: Object.freeze({}),
  locateNonce: 0,
});

const store = createStore<TourAt>()(() => INITIAL);

let boundStorage: TabStorage | null = null;
// Set when a companion window opens with `?panels=closed` so cloned sessionStorage never restores the opener's Tour bar.
let suppressed = false;

function parseActive(raw: string | null): TourActive | null {
  if (raw === null || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const scenarioId = Reflect.get(parsed, "scenarioId");
    const step = Reflect.get(parsed, "step");
    if (
      typeof scenarioId !== "string" ||
      scenarioId === "" ||
      typeof step !== "number" ||
      !Number.isInteger(step) ||
      step < 0
    )
      return null;
    return { scenarioId, step };
  } catch {
    // malformed storage value: treat as no active Tour step
    return null;
  }
}

function readPersisted(storage: TabStorage | null): string | null {
  if (storage === null) return null;
  try {
    return storage.getItem(TOUR_ACTIVE_KEY);
  } catch {
    // refusing tab storage holds no persisted step
    return null;
  }
}

function writePersisted(active: TourActive | null): void {
  if (boundStorage === null) return;
  try {
    if (active === null) boundStorage.removeItem(TOUR_ACTIVE_KEY);
    else boundStorage.setItem(TOUR_ACTIVE_KEY, JSON.stringify(active));
  } catch {
    // refusing tab storage keeps active step in memory for this page load only
  }
}

/** The step the person is on in the scenario `scenarioId`; null while that scenario is not the one open. */
export function useTourStep(scenarioId: string): number | null {
  const read = (): number | null => {
    const { active } = store.getState();
    return active !== null && active.scenarioId === scenarioId
      ? active.step
      : null;
  };
  return useSyncExternalStore(store.subscribe, read, read);
}

/** The scenario and step currently active in this tab; null while none is open. */
export function useTourActive(): TourActive | null {
  const read = (): TourActive | null => store.getState().active;
  return useSyncExternalStore(store.subscribe, read, read);
}

/** The scenario currently viewed in the Focused Stepper; null while browsing the Journey Hub. */
export function useTourSelected(): string | null {
  const read = (): string | null => store.getState().selectedId;
  return useSyncExternalStore(store.subscribe, read, read);
}

/** The last set-up refusal recorded for `scenarioId`; null when none. */
export function useTourRefusal(scenarioId: string): TourRefusal | null {
  const read = (): TourRefusal | null =>
    store.getState().refusals[scenarioId] ?? null;
  return useSyncExternalStore(store.subscribe, read, read);
}

/** Increments whenever the person re-clicks the active step to bring its ringed control back into view. */
export function useTourLocateNonce(): number {
  const read = (): number => store.getState().locateNonce;
  return useSyncExternalStore(store.subscribe, read, read);
}

export const tourActions: {
  open(scenarioId: string, step: number): void;
  select(scenarioId: string | null): void;
  setRefusal(scenarioId: string, refusal: TourRefusal | null): void;
  close(): void;
  suppress(): void;
  hydrate(
    storage: TabStorage | null,
    isValid?: (scenarioId: string, step: number) => boolean,
  ): void;
} = Object.freeze({
  open(scenarioId: string, step: number) {
    guardWrite("tour");
    suppressed = false;
    const next: TourActive = { scenarioId, step };
    store.setState((prev) => ({
      ...prev,
      active: next,
      selectedId: scenarioId,
      locateNonce:
        prev.active?.scenarioId === scenarioId && prev.active.step === step
          ? prev.locateNonce + 1
          : prev.locateNonce,
    }));
    writePersisted(next);
  },
  select(scenarioId: string | null) {
    guardWrite("tour");
    store.setState((prev) => ({ ...prev, selectedId: scenarioId }));
  },
  setRefusal(scenarioId: string, refusal: TourRefusal | null) {
    guardWrite("tour");
    store.setState((prev) => {
      const next = { ...prev.refusals };
      if (refusal === null) delete next[scenarioId];
      else next[scenarioId] = refusal;
      return { ...prev, refusals: Object.freeze(next) };
    });
  },
  close() {
    guardWrite("tour");
    store.setState((prev) => ({
      ...prev,
      active: null,
      refusals: Object.freeze({}),
      locateNonce: 0,
    }));
    writePersisted(null);
  },
  suppress() {
    suppressed = true;
    store.setState(INITIAL);
    writePersisted(null);
  },
  hydrate(
    storage: TabStorage | null,
    isValid?: (scenarioId: string, step: number) => boolean,
  ) {
    boundStorage = storage;
    if (suppressed) {
      suppressed = false;
      writePersisted(null);
      store.setState(INITIAL);
      return;
    }
    const current = store.getState().active;
    if (current !== null) {
      if (isValid !== undefined && !isValid(current.scenarioId, current.step)) {
        writePersisted(null);
        store.setState((prev) => ({
          ...prev,
          active: null,
          selectedId:
            prev.selectedId === current.scenarioId ? null : prev.selectedId,
        }));
      }
      return;
    }
    const restored = parseActive(readPersisted(storage));
    if (restored === null) return;
    if (isValid !== undefined && !isValid(restored.scenarioId, restored.step)) {
      writePersisted(null);
      return;
    }
    store.setState((prev) => ({
      ...prev,
      active: restored,
      selectedId: prev.selectedId ?? restored.scenarioId,
    }));
  },
});
