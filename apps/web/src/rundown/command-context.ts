// Pure CommandContext.rundown builder computing exact move, clipboard, and previous-value readiness.
import type { CommandContext } from "@manent/commands";
import type { RundownJSON } from "@manent/schema";
import type { GridCellCoord } from "@manent/ui";
import { readCopiedRows } from "./clipboard.ts";
import { storedCellOf } from "./previous-value-model.ts";
import { planStepMove, targetRowIdsOf } from "./row-actions.ts";

/** Computes the rundown command context for `rundownActions.setContext`. */
export function buildRundownCommandContext(options: {
  readonly canEdit: boolean;
  readonly rundown: RundownJSON | null;
  readonly activeCell: GridCellCoord | null;
  readonly selectedRowIds: ReadonlySet<string>;
  readonly editingCell: boolean;
}): NonNullable<CommandContext["rundown"]> {
  const { canEdit, rundown, activeCell, selectedRowIds, editingCell } = options;
  const activeRowId = activeCell?.rowId ?? null;
  const scriptRowSelected =
    rundown !== null &&
    rundown.rows.some(
      (row) =>
        row.kind === "script" &&
        (selectedRowIds.size > 0
          ? selectedRowIds.has(row.id)
          : row.id === activeRowId),
    );
  const targets =
    rundown === null ? [] : targetRowIdsOf(rundown, selectedRowIds, activeCell);
  const canMoveUp =
    rundown !== null &&
    targets.length > 0 &&
    planStepMove(rundown.rows, targets, -1, null).ok;
  const canMoveDown =
    rundown !== null &&
    targets.length > 0 &&
    planStepMove(rundown.rows, targets, 1, null).ok;
  const activeRow =
    rundown === null || activeRowId === null
      ? undefined
      : rundown.rows.find((row) => row.id === activeRowId);
  const activeStored =
    activeRow === undefined || activeCell === null
      ? null
      : storedCellOf(activeRow, activeCell.columnId);
  const hasPreviousValue =
    activeStored !== null && activeStored.cell.previous !== null;

  return {
    canEdit,
    selectedRows: selectedRowIds.size,
    scriptRowSelected,
    editingCell,
    canMoveUp,
    canMoveDown,
    hasClipboard: readCopiedRows() !== null,
    hasPreviousValue,
  };
}
