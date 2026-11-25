// Rundown History diff tables and overlay frame (loaded lazily with HistoryRundownChanges).
import { isRundownRowChange } from "@manent/revisions";
import type { RundownComparison, RundownRowDiff } from "@manent/revisions";
import type { RundownColumnId, RundownJSON } from "@manent/schema";
import {
  Button,
  HISTORY_WORDS,
  RUNDOWN_HISTORY_WORDS,
  RUNDOWN_WORDS,
} from "@manent/ui";
import type { CSSProperties, ReactNode } from "react";
import { rowTitleOf } from "../../rundown/dur-format.ts";
import { openRundownRestore } from "./history-rundown-dialog.tsx";
import {
  AsItWasGrid,
  formatRundownCellValue,
  rowDisplayNum,
  rundownCellText,
} from "./history-rundown-nav.tsx";
import type { RundownNavChange } from "./history-rundown-nav.tsx";

const OVERLAY_AREA: CSSProperties = Object.freeze({ gridArea: "page" });

function diffRowAttr(
  rowDiff: RundownRowDiff,
): "added" | "removed" | "moved" | undefined {
  if (rowDiff.kind === "added") return "added";
  if (rowDiff.kind === "removed") return "removed";
  if (rowDiff.moved) return "moved";
  return undefined;
}

function DiffRowBadge(props: { readonly rowDiff: RundownRowDiff }): ReactNode {
  const { rowDiff } = props;
  if (rowDiff.kind === "added") {
    return (
      <span className="rounded-micro border border-ok px-1 text-micro font-medium text-ok">
        {RUNDOWN_HISTORY_WORDS.added}
      </span>
    );
  }
  if (rowDiff.kind === "removed") {
    return (
      <span className="rounded-micro border border-danger px-1 text-micro font-medium text-danger">
        {RUNDOWN_HISTORY_WORDS.removed}
      </span>
    );
  }
  if (
    rowDiff.moved &&
    rowDiff.beforeIndex !== null &&
    rowDiff.afterIndex !== null
  ) {
    const fromNum = rowDiff.beforeIndex + 1;
    const label =
      rowDiff.afterIndex < rowDiff.beforeIndex
        ? RUNDOWN_HISTORY_WORDS.movedUpFrom(fromNum)
        : RUNDOWN_HISTORY_WORDS.movedDownFrom(fromNum);
    return (
      <span className="rounded-micro border border-focus px-1 text-micro font-medium text-fg">
        {label}
      </span>
    );
  }
  return null;
}

function DiffTable(props: {
  readonly docId: string;
  readonly versionId: string | null;
  readonly versionRefText: string;
  readonly columns: readonly RundownColumnId[];
  readonly comparison: RundownComparison;
  readonly currentChange: RundownNavChange | null;
  readonly canEdit: boolean;
  readonly restoreLabel: string;
  readonly side?: "before" | "after";
}): ReactNode {
  const {
    docId,
    versionId,
    versionRefText,
    columns,
    comparison,
    currentChange,
    canEdit,
    restoreLabel,
    side,
  } = props;
  const visibleCols = columns.filter(
    (col) =>
      col === "number" ||
      col === "segment" ||
      col === "story" ||
      col === "writer" ||
      col === "presenter" ||
      col === "type" ||
      col === "dur",
  );
  return (
    <div role="grid" className="divide-y divide-line text-ui">
      <div
        role="row"
        className="mn-table-head flex items-center gap-2 border-b border-line bg-chrome px-3 py-1.5 text-micro font-medium text-fg-muted"
      >
        {visibleCols.map((col) => (
          <span
            key={col}
            role="columnheader"
            className="min-w-16 flex-1 truncate"
          >
            {RUNDOWN_WORDS.columns[col]}
          </span>
        ))}
        {canEdit && side !== "before" ? (
          <span className="w-20 shrink-0" />
        ) : null}
      </div>
      {comparison.rows.map((rowDiff, idx) => {
        const displayRow =
          side === "before"
            ? rowDiff.before
            : side === "after"
              ? rowDiff.after
              : (rowDiff.after ?? rowDiff.before);
        if (displayRow === null) return null;
        const rowAttr = diffRowAttr(rowDiff);
        const isCurrentRow = currentChange?.rowId === rowDiff.id;
        const rowNum = rowDisplayNum(rowDiff, idx);
        const rowTitle =
          rowTitleOf(displayRow) || RUNDOWN_WORDS.rowFallback(rowNum);
        const isHeader = displayRow.kind === "header";
        const canRestoreRow =
          canEdit &&
          side !== "before" &&
          versionId !== null &&
          rowDiff.before !== null &&
          isRundownRowChange(rowDiff);
        return (
          <div
            key={rowDiff.id}
            role="row"
            data-diff-row={rowAttr}
            data-change-current={
              isCurrentRow && currentChange.columnId === null ? "" : undefined
            }
            className={`flex items-center gap-2 px-3 py-1.5 ${
              rowAttr === "added"
                ? "border-s-2 border-ok bg-subtle"
                : rowAttr === "removed"
                  ? "border-s-2 border-danger bg-subtle line-through"
                  : rowAttr === "moved"
                    ? "border-s-2 border-focus bg-subtle"
                    : ""
            }`}
          >
            {visibleCols.map((col, colIdx) => {
              const cellDiff =
                side === "before"
                  ? undefined
                  : rowDiff.cells.find((c) => c.columnId === col);
              const isCurrentCell =
                isCurrentRow && currentChange.columnId === col;
              const valueText =
                col === "number"
                  ? isHeader
                    ? ""
                    : String(rowNum)
                  : rundownCellText(displayRow, col);
              const priorText =
                cellDiff === undefined
                  ? null
                  : cellDiff.before === null || cellDiff.before === ""
                    ? RUNDOWN_HISTORY_WORDS.wasEmpty
                    : RUNDOWN_HISTORY_WORDS.wasValue(
                        formatRundownCellValue(col, cellDiff.before),
                      );
              return (
                <div
                  key={col}
                  role="gridcell"
                  data-change-current={isCurrentCell ? "" : undefined}
                  className="min-w-16 flex-1"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-fg">{valueText}</span>
                    {colIdx === 1 ? <DiffRowBadge rowDiff={rowDiff} /> : null}
                  </div>
                  {priorText === null ? null : (
                    <span className="block text-meta text-fg-muted">
                      {priorText}
                    </span>
                  )}
                </div>
              );
            })}
            {canEdit && side !== "before" ? (
              <div className="flex w-20 shrink-0 justify-end">
                {canRestoreRow ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openRundownRestore({
                        kind: "row",
                        docId,
                        versionId,
                        ref: versionRefText,
                        rowId: rowDiff.id,
                        rowNum: isHeader ? null : rowNum,
                        rowTitle,
                      })
                    }
                  >
                    {restoreLabel}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Full-area overlay portalled over `[data-rundown-page]` for `In the grid`, `Side by side`, and `As it was`. */
export function RundownHistoryOverlay(props: {
  readonly docId: string;
  readonly baselineTitle: string;
  readonly versionId: string | null;
  readonly refText: string;
  readonly mode: "page" | "side" | "as_it_was";
  readonly baselineRundown: RundownJSON;
  readonly comparison: RundownComparison | null;
  readonly columns: readonly RundownColumnId[];
  readonly currentChange: RundownNavChange | null;
  readonly canEdit: boolean;
  readonly restoreLabel: string;
  readonly backLabel: string;
  readonly onBack: () => void;
}): ReactNode {
  const {
    docId,
    baselineTitle,
    versionId,
    refText,
    mode,
    baselineRundown,
    comparison,
    columns,
    currentChange,
    canEdit,
    restoreLabel,
    backLabel,
    onBack,
  } = props;
  return (
    <div
      data-rundown-history-overlay=""
      data-rundown-history-mode={mode === "page" ? "grid" : mode}
      className="z-20 flex min-h-0 flex-col overflow-hidden bg-chrome @container"
      style={OVERLAY_AREA}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line bg-chrome px-3 py-2 text-ui">
        <span className="truncate font-medium text-fg">{baselineTitle}</span>
        <div className="flex items-center gap-2">
          {canEdit && versionId !== null ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                openRundownRestore({
                  kind: "all",
                  docId,
                  versionId,
                  ref: refText,
                })
              }
            >
              {RUNDOWN_HISTORY_WORDS.restoreButton(refText)}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            {backLabel}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {mode === "as_it_was" ? (
          <AsItWasGrid rundown={baselineRundown} columns={columns} />
        ) : comparison === null ? null : mode === "side" ? (
          <div className="grid grid-cols-2 divide-x divide-line @max-[50rem]:grid-cols-1">
            <section aria-label={baselineTitle} className="min-w-0">
              <header className="border-b border-line bg-raised px-3 py-1.5 text-meta font-medium text-fg-muted">
                {baselineTitle}
              </header>
              <DiffTable
                docId={docId}
                versionId={versionId}
                versionRefText={refText}
                columns={columns}
                comparison={comparison}
                currentChange={currentChange}
                canEdit={false}
                restoreLabel={restoreLabel}
                side="before"
              />
            </section>
            <section
              aria-label={HISTORY_WORDS.workingLabel}
              className="min-w-0"
            >
              <header className="border-b border-line bg-raised px-3 py-1.5 text-meta font-medium text-fg-muted">
                {HISTORY_WORDS.workingLabel}
              </header>
              <DiffTable
                docId={docId}
                versionId={versionId}
                versionRefText={refText}
                columns={columns}
                comparison={comparison}
                currentChange={currentChange}
                canEdit={canEdit}
                restoreLabel={restoreLabel}
                side="after"
              />
            </section>
          </div>
        ) : (
          <DiffTable
            docId={docId}
            versionId={versionId}
            versionRefText={refText}
            columns={columns}
            comparison={comparison}
            currentChange={currentChange}
            canEdit={canEdit}
            restoreLabel={restoreLabel}
          />
        )}
      </div>
    </div>
  );
}
