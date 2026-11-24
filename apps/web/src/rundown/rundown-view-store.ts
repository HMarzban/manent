// Reactive per-rundown view snapshot store shared by screen.tsx, state-facts.ts and row-readout.tsx.
import type { RundownClock } from "@manent/pagination";
import type { RundownJSON } from "@manent/schema";
import type { GridCellCoord } from "@manent/ui";
import { useSyncExternalStore } from "react";
import type { RundownAccess, RundownPerson } from "./rundown-access.ts";

export interface RundownViewState {
  readonly ready: boolean;
  readonly rundown: RundownJSON | null;
  readonly clock: RundownClock | null;
  readonly onDevice: ReadonlySet<string>;
  readonly access: RundownAccess;
  readonly people: readonly RundownPerson[];
  readonly projectTitle: string | null;
  readonly activeCell: GridCellCoord | null;
  readonly selectedRowIds: ReadonlySet<string>;
  readonly editingCell: boolean;
}

const views = new Map<string, RundownViewState>();
const listeners = new Map<string, Set<() => void>>();

function notify(docId: string): void {
  const subs = listeners.get(docId);
  if (subs === undefined) return;
  for (const fn of subs) fn();
}

export function getRundownView(docId: string): RundownViewState | undefined {
  return views.get(docId);
}

export function setRundownView(
  docId: string,
  next: RundownViewState | null,
): void {
  if (next === null) views.delete(docId);
  else views.set(docId, next);
  notify(docId);
}

function subscribeView(docId: string, fn: () => void): () => void {
  let subs = listeners.get(docId);
  if (subs === undefined) {
    subs = new Set();
    listeners.set(docId, subs);
  }
  subs.add(fn);
  return () => {
    subs.delete(fn);
    if (subs.size === 0) listeners.delete(docId);
  };
}

/** Reads the live view state of `docId` (null while the rundown screen is not mounted). */
export function useRundownView(docId: string): RundownViewState | null {
  return useSyncExternalStore(
    (onStoreChange) => subscribeView(docId, onStoreChange),
    () => views.get(docId) ?? null,
  );
}
