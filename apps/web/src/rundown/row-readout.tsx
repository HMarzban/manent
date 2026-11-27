// Status bar row readout for an open rundown: "Row 2 of 15 · Monologue", a header/unnumbered title alone, or "3 rows selected".
import { RUNDOWN_WORDS } from "@manent/ui";
import type { ReactNode } from "react";
import { rowTitleOf } from "./dur-format.ts";
import { useRundownView } from "./rundown-session.ts";

/** Computes the status-bar readout text for the active or selected row(s); null when nothing is focused or selected. */
export function rowReadoutText(
  view: ReturnType<typeof useRundownView>,
): string | null {
  if (view === null || view.rundown === null || view.clock === null)
    return null;
  if (view.selectedRowIds.size > 1)
    return RUNDOWN_WORDS.rowsSelected(view.selectedRowIds.size);

  const focusedId =
    view.activeCell?.rowId ??
    (view.selectedRowIds.size === 1
      ? [...view.selectedRowIds][0]
      : (view.rundown.rows[0]?.id ?? null));
  if (focusedId === null) return null;

  const row = view.rundown.rows.find((candidate) => candidate.id === focusedId);
  const timing = view.clock.rows.find(
    (candidate) => candidate.id === focusedId,
  );
  if (row === undefined || timing === undefined) return null;

  const title = rowTitleOf(row);
  if (row.kind === "header" || timing.number === null)
    return title === "" ? null : title;

  const numberedTotal = view.clock.rows.filter(
    (entry) => entry.number !== null,
  ).length;
  return RUNDOWN_WORDS.rowReadout(
    timing.number,
    numberedTotal,
    title === "" ? null : title,
  );
}

export function RowReadout(props: { docId: string }): ReactNode {
  const view = useRundownView(props.docId);
  const text = rowReadoutText(view);
  if (text === null) return null;
  return (
    <span
      data-tour="status:row"
      title={text}
      className="max-w-64 shrink-0 truncate px-2 text-meta font-normal text-fg-muted tabular-nums"
    >
      {text}
    </span>
  );
}
