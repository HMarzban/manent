// What the History tab shows, written by the tab as it draws, for the commands that act on it.
import { historyActions } from "../state/history.store.ts";
import type { HistoryState } from "../state/history.store.ts";
import type { HistoryRow } from "./history-rows.ts";

interface HistoryView {
  docId: string;
  rows: readonly HistoryRow[];
  selected: HistoryRow | null;
  step: number | null;
  filter: HistoryState["filter"];
}

let shown: HistoryView | null = null;

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
