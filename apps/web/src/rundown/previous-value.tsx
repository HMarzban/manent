// Cell recent-change corner marks, Previous value popover (`cell_popover`), Restore action and `rundown:cell` hook.
import { restoreCell } from "@manent/crdt";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RUNDOWN_WORDS,
} from "@manent/ui";
import type { GridCellCoord, RestoredRowPlace } from "@manent/ui";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import { nameOf } from "../services/sync/index-entries.ts";
import { rundownActions } from "../state/rundown.store.ts";
import { columnMenuLabel } from "./columns.tsx";
import { rowTitleOf } from "./dur-format.ts";
import {
  CORNER_MARK_WINDOW_MS,
  STORED_COLUMNS,
  formatCellDisplayValue,
  formatPreviousWhen,
  isRecentOtherChange,
  storedCellOf,
  tourCellOf,
} from "./previous-value-model.ts";
import type { RundownSessionControls } from "./rundown-session.ts";
import { useRundownView } from "./rundown-view-store.ts";

export {
  CORNER_MARK_WINDOW_MS,
  formatCellDisplayValue,
  formatPreviousWhen,
  isRecentOtherChange,
  tourCellOf,
} from "./previous-value-model.ts";

const UNDO_ACTION = Object.freeze([{ label: "Undo", commandId: "edit.undo" }]);

/**
 * Returns a predicate `(rowId, columnId) => boolean` true while another person changed that cell in the last minute,
 * scheduling one expiry timer for the soonest-expiring corner mark.
 */
export function useCornerMark(
  docId: string,
): (rowId: string, columnId: string) => boolean {
  const services = useServices();
  const { now, schedule } = useEnvironment();
  const view = useRundownView(docId);
  const [tickCount, tick] = useReducer((count: number) => count + 1, 0);

  const rundown = view?.rundown ?? null;
  const userId = services.userId;

  const { markedKeys, nextExpiryAt } = useMemo(() => {
    const keys = new Set<string>();
    let earliest: number | null = null;
    if (rundown !== null) {
      const current = now();
      for (const row of rundown.rows) {
        for (const col of STORED_COLUMNS) {
          const cell = row.cells[col];
          if (!isRecentOtherChange(cell, userId, current)) continue;
          keys.add(`${row.id}\0${col}`);
          if (row.kind === "header") {
            keys.add(`${row.id}\0segment`);
            keys.add(`${row.id}\0story`);
          }
          const expiresAt = cell!.setAt + CORNER_MARK_WINDOW_MS;
          if (earliest === null || expiresAt < earliest) earliest = expiresAt;
        }
      }
    }
    return { markedKeys: keys, nextExpiryAt: earliest };
  }, [rundown, userId, now, tickCount]);

  useEffect(() => {
    if (nextExpiryAt === null) return;
    const delay = Math.max(1, nextExpiryAt - now());
    return schedule(tick, delay);
  }, [nextExpiryAt, now, schedule]);

  return useCallback(
    (rowId: string, columnId: string) =>
      markedKeys.has(`${rowId}\0${columnId}`),
    [markedKeys],
  );
}

export interface PreviousValueState {
  readonly openCell: GridCellCoord | null;
  readonly tourCell: GridCellCoord | null;
  openFor(rowId: string, columnId: string): void;
  close(): void;
  restore(): void;
}

/**
 * Manages the `cell_popover` open target, `rundown:cell` tour target, and fills the `cells` slot of `rundown.store.ts`
 * with `previousValue` and `restorePrevious`.
 */
export function usePreviousValue(options: {
  readonly docId: string;
  readonly session: RundownSessionControls;
  readonly titleColumn: "segment" | "story";
}): PreviousValueState {
  const { docId, session, titleColumn } = options;
  const services = useServices();
  const { dom, now } = useEnvironment();
  const [openCell, setOpenCell] = useState<GridCellCoord | null>(null);

  const stateRef = useRef({ session, titleColumn, openCell });
  stateRef.current = { session, titleColumn, openCell };

  useEffect(() => {
    setOpenCell(null);
  }, [docId]);

  const close = useCallback((): void => {
    setOpenCell(null);
    dom.restoreFocus();
  }, [dom]);

  const openFor = useCallback(
    (rowId: string, columnId: string): void => {
      const rundown = stateRef.current.session.view.rundown;
      if (rundown === null) return;
      const row = rundown.rows.find((candidate) => candidate.id === rowId);
      if (row === undefined) return;
      const found = storedCellOf(row, columnId);
      if (found === null || found.cell.previous === null) return;
      dom.rememberFocus();
      setOpenCell({
        rowId: row.id,
        columnId:
          row.kind === "header" ? stateRef.current.titleColumn : found.columnId,
      });
    },
    [dom],
  );

  const restore = useCallback((): void => {
    const {
      session: cur,
      titleColumn: titleCol,
      openCell: currentOpen,
    } = stateRef.current;
    const handle = cur.getHandle();
    const rundown = cur.view.rundown;
    if (handle === null || rundown === null || cur.view.access !== "edit")
      return;
    const coord = currentOpen ?? cur.view.activeCell;
    if (coord === null) return;
    const row = rundown.rows.find((candidate) => candidate.id === coord.rowId);
    if (row === undefined) return;
    const found = storedCellOf(
      row,
      row.kind === "header" ? titleCol : coord.columnId,
    );
    if (found === null || found.cell.previous === null) return;

    restoreCell(handle.doc(), row.id, found.columnId, {
      userId: services.userId,
      now,
    });
    cur.recordUndo({ message: RUNDOWN_WORDS.undidRestore });
    setOpenCell(null);
    dom.restoreFocus();

    const timing = cur.view.clock?.rows.find((entry) => entry.id === row.id);
    const title = rowTitleOf(row);
    const fallbackTitle = title !== "" ? title : RUNDOWN_WORDS.rowFallback(1);
    const place: RestoredRowPlace =
      row.kind === "header" ||
      timing?.number === null ||
      timing?.number === undefined
        ? { kind: "header", title: fallbackTitle }
        : { kind: "row", number: timing.number };
    const restoredText =
      formatCellDisplayValue(found.columnId, found.cell.previous.value) ??
      RUNDOWN_WORDS.dash;
    services.messages.withdraw("rundown.action");
    services.messages.withdraw("rundown.undo");
    services.messages.push({
      id: "rundown.action",
      text: RUNDOWN_WORDS.restoredCell(
        columnMenuLabel(found.columnId),
        place,
        restoredText,
      ),
      lifetime: "reverse",
      ownWork: false,
      actions: UNDO_ACTION,
    });
  }, [services, now, dom]);

  useEffect(() => {
    const actions = Object.freeze({
      previousValue() {
        const { session: cur, titleColumn: titleCol } = stateRef.current;
        const active = cur.view.activeCell;
        if (active === null) return;
        const row = cur.view.rundown?.rows.find(
          (candidate) => candidate.id === active.rowId,
        );
        if (row === undefined) return;
        openFor(row.id, row.kind === "header" ? titleCol : active.columnId);
      },
      restorePrevious: restore,
    });
    rundownActions.provide("cells", actions);
    return () => {
      if (rundownActions.slot("cells") === actions)
        rundownActions.provide("cells", Object.freeze({}));
    };
  }, [docId, openFor, restore]);

  const tourCell = useMemo(
    () => tourCellOf(session.view.rundown, openCell, titleColumn),
    [session.view.rundown, openCell, titleColumn],
  );

  return { openCell, tourCell, openFor, close, restore };
}

function anchorStyleFor(coord: GridCellCoord | null): CSSProperties {
  if (coord === null) return { top: 0, left: 0, width: 0, height: 0 };
  const cells = document.querySelectorAll<HTMLElement>('[role="gridcell"]');
  let fallback: HTMLElement | null = null;
  let exact: HTMLElement | null = null;
  for (const node of cells) {
    if (node.dataset.rowId !== coord.rowId) continue;
    fallback ??= node;
    if (node.dataset.colId === coord.columnId) {
      exact = node;
      break;
    }
  }
  const rect = (exact ?? fallback)?.getBoundingClientRect();
  if (rect === undefined || (rect.width === 0 && rect.height === 0)) {
    return { top: 120, left: 240, width: 1, height: 1 };
  }
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/** Transient `cell_popover` showing who wrote a cell's current value, when, its previous value and a Restore action. */
export function PreviousValuePopover(props: {
  readonly docId: string;
  readonly state: PreviousValueState;
  readonly canEdit: boolean;
}): ReactNode {
  const { docId, state, canEdit } = props;
  const services = useServices();
  const { now } = useEnvironment();
  const view = useRundownView(docId);
  const restoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const [anchorStyle, setAnchorStyle] = useState<CSSProperties>(() => ({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  }));

  const target = useMemo(() => {
    if (state.openCell === null || view === null || view.rundown === null)
      return null;
    const row = view.rundown.rows.find(
      (candidate) => candidate.id === state.openCell!.rowId,
    );
    if (row === undefined) return null;
    const found = storedCellOf(row, state.openCell.columnId);
    if (found === null || found.cell.previous === null) return null;
    return { row, columnId: found.columnId, cell: found.cell };
  }, [state.openCell, view]);

  useLayoutEffect(() => {
    if (target === null) return;
    setAnchorStyle(anchorStyleFor(state.openCell));
  }, [target, state.openCell]);

  useEffect(() => {
    if (target === null || !canEdit) return;
    restoreButtonRef.current?.focus();
  }, [target, canEdit]);

  if (target === null) return null;

  const who =
    target.cell.userId === services.userId
      ? RUNDOWN_WORDS.you
      : nameOf(target.cell.userId);
  const when = formatPreviousWhen(target.cell.setAt, now());
  const heading = RUNDOWN_WORDS.previousValue(who, when);
  const was = RUNDOWN_WORDS.wasValue(
    formatCellDisplayValue(target.columnId, target.cell.previous!.value),
  );

  return (
    <Popover
      open={true}
      onOpenChange={(next) => {
        if (!next) state.close();
      }}
    >
      <PopoverTrigger
        aria-hidden="true"
        tabIndex={-1}
        style={anchorStyle}
        className="pointer-events-none fixed opacity-0"
      />
      <PopoverContent
        data-surface="cell_popover"
        side="bottom"
        align="end"
        sideOffset={4}
        aria-label={heading}
        className="w-auto min-w-menu-min max-w-popover gap-2 rounded-surface border border-line bg-overlay p-3 text-ui text-fg shadow-overlay"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-fg tabular-nums">{heading}</span>
          <Button
            ref={restoreButtonRef}
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEdit}
            className={
              canEdit
                ? "shrink-0 cursor-pointer hover:bg-subtle"
                : "shrink-0 cursor-not-allowed text-fg-muted opacity-50"
            }
            onClick={state.restore}
          >
            {RUNDOWN_WORDS.restore}
          </Button>
        </div>
        <p className="text-meta text-fg-muted tabular-nums">{was}</p>
      </PopoverContent>
    </Popover>
  );
}
