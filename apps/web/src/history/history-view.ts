// What the History tab shows, written by the tab as it draws, for the commands that act on it.
import { historyActions } from "../state/history.store.ts";
import type { ChangesMode, HistoryState } from "../state/history.store.ts";
import type { HistoryRow } from "./history-rows.ts";

interface HistoryView {
  docId: string;
  rows: readonly HistoryRow[];
  selected: HistoryRow | null;
  baseline: HistoryRow | null;
  mode: ChangesMode;
  step: number | null;
  filter: HistoryState["filter"];
  /** The changes the person chosen in Filter ▾ made; null narrows nothing. */
  blockIds: readonly string[] | null;
}

let shown: HistoryView | null = null;
let rowLinkPending = false;

/** Null while the History tab is not drawn. */
export const historyView: {
  get(): HistoryView | null;
  set(view: HistoryView | null): void;
} = Object.freeze({
  get: () => shown,
  set: (view: HistoryView | null) => {
    shown = view;
  },
});

/** Selects `row`, which a command run straight after then finds selected, before the tab has drawn it. */
export function selectRow(row: HistoryRow): void {
  historyActions.select(row.item.id);
  if (shown !== null) shown = { ...shown, selected: row };
}

/** Updates the active comparison baseline row shown in Changes since. */
export function setBaselineRow(row: HistoryRow | null): void {
  if (shown !== null) shown = { ...shown, baseline: row };
}

/** Marks the next `history.copyLink` run as coming from a single-version row menu. */
export function markRowLink(): void {
  rowLinkPending = true;
}

/** Consumes whether `history.copyLink` was invoked from a single-version row menu. */
export function takeRowLink(): boolean {
  const pending = rowLinkPending;
  rowLinkPending = false;
  return pending;
}
