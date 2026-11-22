// What the History tab shows: the selected version, the baseline of Changes since and how it is shown; written only by interface events.

import type { VersionPosition } from "@manent/sync-protocol";
import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

export type ChangesMode = "page" | "side" | "asterisks" | "as_it_was";

/** A version is viewed while `baseline` is set and `mode` is `as_it_was`; changes are shown while it is set in any other mode. */
export interface HistoryState {
  docId: string | null;
  /** The version whose row is current. */
  selected: string | null;
  /** Changes since this; `versionId` is null for a position that is no version, such as where you last opened. */
  baseline: {
    versionId: string | null;
    position: VersionPosition | null;
    title: string;
    date: string | null;
  } | null;
  /** View state, kept across documents. */
  mode: ChangesMode;
  /** Null shows every scene, or every person. */
  filter: {
    sceneIds: readonly string[] | null;
    authorUserIds: readonly string[] | null;
  };
  step: number | null;
  draftsOnly: boolean;
  naming: boolean;
}

const UNFILTERED: HistoryState["filter"] = Object.freeze({
  sceneIds: null,
  authorUserIds: null,
});

const store = createStore<HistoryState>()(() => ({
  docId: null,
  selected: null,
  baseline: null,
  mode: "page",
  filter: UNFILTERED,
  step: null,
  draftsOnly: false,
  naming: false,
}));

function write(patch: Partial<HistoryState>): void {
  guardWrite("history");
  store.setState(patch);
}

export function useHistory<K extends keyof HistoryState>(
  key: K,
): HistoryState[K] {
  const read = () => store.getState()[key];
  return useSyncExternalStore(store.subscribe, read, read);
}

/** `reset` starts the tab afresh on `docId` and keeps the mode. */
export const historyActions: {
  select(id: string | null): void;
  setBaseline(b: HistoryState["baseline"]): void;
  setMode(m: ChangesMode): void;
  setFilter(f: HistoryState["filter"]): void;
  setStep(i: number | null): void;
  setDraftsOnly(v: boolean): void;
  setNaming(v: boolean): void;
  reset(docId: string | null): void;
} = Object.freeze({
  select: (selected: string | null) => write({ selected }),
  setBaseline: (baseline: HistoryState["baseline"]) => write({ baseline }),
  setMode: (mode: ChangesMode) => write({ mode }),
  setFilter: (filter: HistoryState["filter"]) => write({ filter }),
  setStep: (step: number | null) => write({ step }),
  setDraftsOnly: (draftsOnly: boolean) => write({ draftsOnly }),
  setNaming: (naming: boolean) => write({ naming }),
  reset: (docId: string | null) =>
    write({
      docId,
      selected: null,
      baseline: null,
      filter: UNFILTERED,
      step: null,
      draftsOnly: false,
      naming: false,
    }),
});
