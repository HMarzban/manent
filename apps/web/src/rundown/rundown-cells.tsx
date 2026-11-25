// Builds EditableGrid columns and rows from the rundown CRDT snapshot and timing clock.
import type { RowTiming, RundownClock } from "@manent/pagination";
import type {
  RundownColumnId,
  RundownJSON,
  RundownRowJSON,
} from "@manent/schema";
import { RUNDOWN_WORDS, formatClockTime, formatDuration } from "@manent/ui";
import type { GridCell, GridCellCoord, GridColumn, GridRow } from "@manent/ui";
import { ChevronRightIcon } from "lucide-react";
import { PrompterCell } from "../prompter/prompter-cell.tsx";
import {
  COLUMN_MAX_WIDTH_PX,
  COLUMN_MIN_WIDTH_PX,
  DEFAULT_COLUMN_WIDTHS_PX,
  columnMenuLabel,
} from "./columns.tsx";
import type { RundownColumnPrefs } from "./columns.tsx";
import { rowTitleOf } from "./dur-format.ts";
import { ROW_MENU_ITEMS, RowMenu } from "./rows.tsx";
import type { RundownPerson } from "./rundown-access.ts";
import {
  buildDurCell,
  cornerMarkOf,
  presenceBadges,
} from "./rundown-cell-parts.tsx";
import { WriterEditor } from "./writer-editor.tsx";

const EDITABLE_COLUMNS = new Set<RundownColumnId>([
  "segment",
  "story",
  "writer",
  "presenter",
  "type",
  "dur",
]);
const NUMERIC_COLUMNS = new Set<RundownColumnId>([
  "number",
  "dur",
  "cume",
  "start",
  "back",
]);
const FLEX_COLUMNS = new Set<RundownColumnId>(["segment", "story", "prompter"]);

/** Builds `GridColumn[]` for the rundown's kind with personal widths, hidden flags and resize accessibility labels. */
export function buildGridColumns(options: {
  readonly columnIds: readonly RundownColumnId[];
  readonly prefs: RundownColumnPrefs;
  readonly people: readonly RundownPerson[];
}): readonly GridColumn[] {
  const hiddenSet = new Set(options.prefs.hidden);
  return options.columnIds.map((id) => {
    const accessible = columnMenuLabel(id);
    const widthPx = options.prefs.widthsPx[id];
    const isFlex = FLEX_COLUMNS.has(id) && widthPx === undefined;
    return {
      id,
      label: RUNDOWN_WORDS.columns[id],
      accessibleLabel: id === "number" ? RUNDOWN_WORDS.rowNumber : undefined,
      numeric: NUMERIC_COLUMNS.has(id),
      editable: EDITABLE_COLUMNS.has(id),
      hidden: hiddenSet.has(id),
      widthPx,
      defaultWidthPx: DEFAULT_COLUMN_WIDTHS_PX[id],
      minWidthPx: COLUMN_MIN_WIDTH_PX,
      maxWidthPx: COLUMN_MAX_WIDTH_PX,
      flex: isFlex,
      resizeLabel: RUNDOWN_WORDS.resizeColumn(accessible),
      resizeValueText: RUNDOWN_WORDS.resizeValue,
      renderEditor:
        id === "writer"
          ? (context) => (
              <WriterEditor context={context} people={options.people} />
            )
          : undefined,
      tourTarget: id === "prompter" ? "rundown:prompter_column" : undefined,
    };
  });
}

function buildItemCells(options: {
  readonly docId: string;
  readonly row: RundownRowJSON;
  readonly label: string;
  readonly timing: RowTiming;
  readonly columnIds: readonly RundownColumnId[];
  readonly offlineMissing: boolean;
  readonly liveDuration: (rowId: string) => number | null;
  readonly cellPresence: (rowId: string, columnId: string) => readonly string[];
  readonly cornerMark: (rowId: string, columnId: string) => boolean;
  readonly tourCell: GridCellCoord | null;
  readonly onOpenBeside: (rowId: string) => void;
  readonly onOpenPrevious: (rowId: string, columnId: RundownColumnId) => void;
}): Record<string, GridCell> {
  const {
    docId,
    row,
    label,
    timing,
    columnIds,
    offlineMissing,
    liveDuration,
    cellPresence,
    cornerMark,
    tourCell,
    onOpenBeside,
    onOpenPrevious,
  } = options;
  const cells: Record<string, GridCell> = {};
  for (const colId of columnIds) {
    const stored = row.cells[colId];
    const cellPresenceNode = presenceBadges(
      cellPresence(row.id, colId),
      "cell",
    );
    const mark = cornerMarkOf(stored, cornerMark(row.id, colId), () =>
      onOpenPrevious(row.id, colId),
    );
    const tourTarget =
      tourCell !== null &&
      tourCell.rowId === row.id &&
      tourCell.columnId === colId
        ? "rundown:cell"
        : undefined;
    switch (colId) {
      case "number":
        cells[colId] = {
          value: timing.number === null ? "" : String(timing.number),
        };
        break;
      case "segment":
      case "story": {
        const text = typeof stored?.value === "string" ? stored.value : "";
        const storyBadge = presenceBadges(
          cellPresence(row.id, "story_open"),
          "script",
        );
        // attach story presence directly on Segment/Story so hiding `#` never misplaces it
        const presence =
          cellPresenceNode !== undefined && storyBadge !== undefined ? (
            <>
              {cellPresenceNode}
              {storyBadge}
            </>
          ) : (
            (cellPresenceNode ?? storyBadge)
          );
        cells[colId] = {
          value: text,
          display:
            row.kind === "script" ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={label}
                  className="inline-flex shrink-0 cursor-pointer items-center text-fg-muted hover:text-fg"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenBeside(row.id);
                  }}
                >
                  <ChevronRightIcon aria-hidden="true" className="size-icon" />
                </button>
                <span className="truncate font-medium text-fg">{text}</span>
              </span>
            ) : (
              <span className="block truncate ps-4 text-fg">{text}</span>
            ),
          tooltip: text !== "" ? text : undefined,
          presence,
          cornerMark: mark,
          tourTarget,
        };
        break;
      }
      case "writer":
      case "presenter":
      case "type": {
        const text = typeof stored?.value === "string" ? stored.value : "";
        cells[colId] = {
          value: text,
          tooltip: text !== "" ? text : undefined,
          presence: cellPresenceNode,
          cornerMark: mark,
          tourTarget,
        };
        break;
      }
      case "dur":
        cells[colId] = {
          ...buildDurCell({
            row,
            timing,
            offlineMissing,
            liveMs: liveDuration(row.id),
            presence: cellPresenceNode,
            cornerMark: mark,
          }),
          tourTarget,
        };
        break;
      case "cume":
        cells[colId] = {
          value: offlineMissing
            ? RUNDOWN_WORDS.dash
            : timing.cumeMs === null
              ? ""
              : formatDuration(timing.cumeMs),
        };
        break;
      case "start":
        cells[colId] = {
          value: offlineMissing
            ? RUNDOWN_WORDS.dash
            : timing.startAt === null
              ? ""
              : formatClockTime(timing.startAt),
        };
        break;
      case "back":
        cells[colId] = {
          value: offlineMissing
            ? RUNDOWN_WORDS.dash
            : timing.backAt === null
              ? ""
              : formatClockTime(timing.backAt),
        };
        break;
      case "prompter":
        cells[colId] = {
          value: "",
          display: <PrompterCell rundownId={docId} rowId={row.id} />,
        };
        break;
    }
  }
  return cells;
}

/** Builds `GridRow[]` from the rundown CRDT snapshot and timing clock. */
export function buildGridRows(options: {
  readonly docId: string;
  readonly rundown: RundownJSON;
  readonly clock: RundownClock;
  readonly columnIds: readonly RundownColumnId[];
  readonly titleColumn: "segment" | "story";
  readonly online: boolean;
  readonly onDevice: ReadonlySet<string>;
  readonly liveDuration: (rowId: string) => number | null;
  readonly cellPresence: (rowId: string, columnId: string) => readonly string[];
  readonly cornerMark: (rowId: string, columnId: string) => boolean;
  readonly activeCell: GridCellCoord | null;
  readonly tourCell: GridCellCoord | null;
  readonly onBeforeMenuOpen: (rowId: string) => void;
  readonly onOpenBeside: (rowId: string) => void;
  readonly onOpenPrevious: (rowId: string, columnId: RundownColumnId) => void;
}): readonly GridRow[] {
  const {
    rundown,
    clock,
    titleColumn,
    online,
    onDevice,
    cornerMark,
    activeCell,
    tourCell,
    onBeforeMenuOpen,
    onOpenPrevious,
  } = options;
  const timingById = new Map(clock.rows.map((entry) => [entry.id, entry]));

  return rundown.rows.map((row, index) => {
    const timing = timingById.get(row.id) ?? {
      id: row.id,
      number: null,
      durMs: null,
      cumeMs: null,
      startAt: null,
      backAt: null,
    };
    const title = rowTitleOf(row);
    const label =
      title !== ""
        ? title
        : RUNDOWN_WORDS.rowFallback(timing.number ?? index + 1);
    const menu =
      ROW_MENU_ITEMS.length > 0 ? (
        <RowMenu
          row={row}
          rowIndex={index}
          rowCount={rundown.rows.length}
          label={RUNDOWN_WORDS.rowHandle(label)}
          activeCell={activeCell}
          onBeforeOpen={onBeforeMenuOpen}
          onOpenPrevious={onOpenPrevious}
        />
      ) : undefined;

    if (row.kind === "header") {
      const storedCell =
        row.cells[titleColumn] ?? row.cells.segment ?? row.cells.story;
      return {
        id: row.id,
        kind: "header",
        label,
        cells: {},
        headerValue: title,
        headerCornerMark: cornerMarkOf(
          storedCell,
          cornerMark(row.id, titleColumn),
          () => onOpenPrevious(row.id, titleColumn),
        ),
        headerTourTarget:
          tourCell !== null && tourCell.rowId === row.id
            ? "rundown:cell"
            : undefined,
        menu,
      };
    }

    const offlineMissing =
      !online &&
      row.kind === "script" &&
      row.docId !== null &&
      !onDevice.has(row.docId);

    return {
      id: row.id,
      kind: "item",
      label,
      cells: buildItemCells({ ...options, row, label, timing, offlineMissing }),
      menu,
    };
  });
}
