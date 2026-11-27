// Calm grid footer bar on non-empty rundowns: Add row / Add header row / Import rows (when editable), Columns, and broadcast timing summary.
import type { RundownClock } from "@manent/pagination";
import type { RundownRowJSON } from "@manent/schema";
import {
  Button,
  RUNDOWN_WORDS,
  cn,
  formatDuration,
  useCommandState,
  useCommands,
} from "@manent/ui";
import { Columns3Icon, FileDownIcon, MinusIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { formatSignedOver, prompterTally } from "./section-timing.ts";

/**
 * Quiet archival action and broadcast summary strip docked beneath non-empty rundown grids.
 * Keeps row-editing actions hidden in read-only mode while still offering Columns and live totals.
 */
export function RundownFooterBar(props: {
  readonly readOnly: boolean;
  readonly hasRows: boolean;
  readonly clock?: RundownClock | null;
  readonly rows?: readonly RundownRowJSON[];
}): ReactNode {
  const { readOnly, hasRows, clock = null, rows = [] } = props;
  const { service } = useCommands();
  const addRow = useCommandState("rundown.addRow");
  const addHeader = useCommandState("rundown.addHeaderRow");
  const importRows = useCommandState("rundown.importRows");
  const columnsCmd = useCommandState("rundown.columns");

  if (!hasRows) return null;

  const showAddRow = !readOnly && addRow.visible;
  const showAddHeader = !readOnly && addHeader.visible;
  const showImport = !readOnly && importRows.visible;
  const showColumns = clock !== null && columnsCmd.visible;
  const tally = prompterTally(rows);
  const overText =
    clock?.overMs !== null && clock?.overMs !== undefined
      ? formatSignedOver(clock.overMs)
      : null;
  const isOver = overText !== null && !overText.startsWith("-");

  if (
    !showAddRow &&
    !showAddHeader &&
    !showImport &&
    !showColumns &&
    clock === null
  )
    return null;

  return (
    <div
      data-tour="rundown:footer"
      className="flex min-h-control shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-chrome px-3 py-1 text-ui"
    >
      <div className="flex flex-wrap items-center gap-1">
        {showAddRow ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!addRow.enabled}
            className="h-control cursor-pointer gap-1.5 px-2 text-meta font-medium text-fg-muted hover:bg-subtle hover:text-fg"
            onClick={() => service.run("rundown.addRow", "control")}
          >
            <PlusIcon aria-hidden="true" className="size-icon shrink-0" />
            <span>{addRow.label}</span>
          </Button>
        ) : null}
        {showAddHeader ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!addHeader.enabled}
            className="h-control cursor-pointer gap-1.5 px-2 text-meta font-medium text-fg-muted hover:bg-subtle hover:text-fg"
            onClick={() => service.run("rundown.addHeaderRow", "control")}
          >
            <MinusIcon aria-hidden="true" className="size-icon shrink-0" />
            <span>{addHeader.label}</span>
          </Button>
        ) : null}
        {showImport ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!importRows.enabled}
            className="h-control cursor-pointer gap-1.5 px-2 text-meta font-medium text-fg-muted hover:bg-subtle hover:text-fg"
            onClick={() => service.run("rundown.importRows", "control")}
          >
            <FileDownIcon aria-hidden="true" className="size-icon shrink-0" />
            <span>{importRows.label}</span>
          </Button>
        ) : null}
        {showColumns ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!columnsCmd.enabled}
            className="h-control cursor-pointer gap-1.5 px-2 text-meta font-medium text-fg-muted hover:bg-subtle hover:text-fg"
            onClick={() => service.run("rundown.columns", "control")}
          >
            <Columns3Icon aria-hidden="true" className="size-icon shrink-0" />
            <span>{RUNDOWN_WORDS.columnsButton}</span>
          </Button>
        ) : null}
      </div>

      {clock !== null ? (
        <div
          data-rundown-footer-summary=""
          className="ms-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-fg-muted tabular-nums"
        >
          <span>
            {RUNDOWN_WORDS.totalRuntime(formatDuration(clock.totalMs))}
          </span>
          {overText !== null ? (
            <>
              <span aria-hidden="true">·</span>
              <span
                className={cn(
                  "font-medium",
                  isOver ? "text-attention" : "text-ok",
                )}
              >
                {RUNDOWN_WORDS.overUnderText(overText)}
              </span>
            </>
          ) : null}
          {tally.total > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {RUNDOWN_WORDS.prompterSentSummary(tally.sent, tally.total)}
              </span>
              {tally.changed > 0 ? (
                <span className="font-medium text-attention">
                  ({RUNDOWN_WORDS.prompterChangedCount(tally.changed)})
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
