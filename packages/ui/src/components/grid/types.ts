// Public types for the editable rundown grid.
import type { CommandDefinition, SurfaceId } from "@manent/commands";
import type { ReactNode, Ref } from "react";

/** Identifies one cell by its row id and visible column id. */
export interface GridCellCoord {
  readonly rowId: string;
  readonly columnId: string;
}

/** Result returned by `onCommitCell`; `{ ok: false, message }` keeps edit mode open and shows `message`. */
export type GridCommitResult =
  | void
  | boolean
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

/** State and callbacks handed to a column's custom inline editor. */
export interface GridEditorContext {
  readonly rowId: string;
  readonly columnId: string;
  readonly value: string;
  readonly initialKey: string | null;
  readonly error: string | null;
  onChange(next: string): void;
  onCommit(direction: "down" | "right" | "left" | "none"): void;
  onCancel(): void;
}

/** Definition of one grid column. All visible and accessible labels arrive as props. */
export interface GridColumn {
  readonly id: string;
  /** Visible heading text (drawn uppercase micro by the grid). */
  readonly label: string;
  /** Accessible heading name when different from `label` (such as "Row number" for "#"). */
  readonly accessibleLabel?: string;
  /** Right-aligned tabular numerals for numeric and timing columns. */
  readonly numeric?: boolean;
  /** Marks the primary column where row-level presence attaches when present. */
  readonly primary?: boolean;
  /** Whether cells in this column can be edited (default false). */
  readonly editable?: boolean;
  /** Hidden columns are excluded from rendering and column counts. */
  readonly hidden?: boolean;
  /** Explicit width in px, clamped to `[minWidthPx, maxWidthPx]`. */
  readonly widthPx?: number;
  /** Fallback width in px when `widthPx` is unset. */
  readonly defaultWidthPx?: number;
  /** Minimum resize width in px (default 48). */
  readonly minWidthPx?: number;
  /** Maximum resize width in px (default 480). */
  readonly maxWidthPx?: number;
  /** Stretches to fill leftover horizontal space when true and not explicitly resized. */
  readonly flex?: boolean;
  /** Whether the column edge can be resized (default true when `onColumnResize` is provided). */
  readonly resizable?: boolean;
  /** Accessible name of the column resize handle (such as "Resize Segment column"). */
  readonly resizeLabel?: string;
  /** Value text announced while focusing or dragging the resize handle (such as "240 px"). */
  readonly resizeValueText?: (widthPx: number) => string;
  /** Custom inline editor; when omitted, the grid draws a text field. */
  readonly renderEditor?: (context: GridEditorContext) => ReactNode;
  /** Optional Tour target attribute placed on this column's header cell. */
  readonly tourTarget?: string;
}

/** Attention-coloured 6 px corner mark indicating a recent change by someone else. */
export interface GridCornerMark {
  /** Accessible description for the cell (such as "Dana changed this at 18:52"). */
  readonly label: string;
  /** Opens the previous-value popover when the corner mark is pressed. */
  readonly onOpen?: () => void;
}

/** Data and slots for one cell in an item row. */
export interface GridCell {
  /** Plain text value used for inline editing and default display. */
  readonly value: string;
  /** Custom rendered display when a cell shows icons, live indicators or inline controls. */
  readonly display?: ReactNode;
  /** Overrides the column's `editable` flag for this cell. */
  readonly editable?: boolean;
  /** Collaborator presence slot (initials or avatars); the cell remains editable. */
  readonly presence?: ReactNode;
  /** Attention corner mark for recently overwritten cells. */
  readonly cornerMark?: GridCornerMark | null;
  /** Accessible label for the cell when its content needs extra description. */
  readonly accessibleLabel?: string;
  /** Tooltip text shown on hover for truncated or annotated values. */
  readonly tooltip?: string;
  /** Optional Tour target attribute placed on this cell (such as "rundown:cell"). */
  readonly tourTarget?: string;
}

/** Data and state for one row of the grid. */
export interface GridRow {
  readonly id: string;
  /** A `"header"` row renders one spanning `gridcell` with `aria-colspan` over every visible column. */
  readonly kind: "item" | "header";
  /** Accessible row name used in drag and move announcements. */
  readonly label: string;
  /** Cells keyed by column id. */
  readonly cells: Readonly<Record<string, GridCell>>;
  /** Editable text of a header row; falls back to the first column's cell value if omitted. */
  readonly headerValue?: string;
  /** Custom display for a header row. */
  readonly headerDisplay?: ReactNode;
  /** Whether a header row is editable (default true unless `readOnly` is set). */
  readonly headerEditable?: boolean;
  /** Row-level presence slot (for example who has this row's story open). */
  readonly presence?: ReactNode;
  /** Corner mark on a header row cell. */
  readonly headerCornerMark?: GridCornerMark | null;
  /** Optional Tour target attribute on a header row cell. */
  readonly headerTourTarget?: string;
  /** Current row state (accent bar, weight 500 and selected fill via `.mn-row`). */
  readonly current?: boolean;
  /** Unavailable reason; draws the row muted with a not-allowed cursor. */
  readonly unavailable?: string;
  /** Row menu handle rendered inside the trailing cell so no control sits outside a gridcell. */
  readonly menu?: ReactNode;
}

/** Polite live-region sentences for command-driven row moves. */
export interface GridAnnouncements {
  /** Announced when a row moves after `afterLabel`. */
  readonly movedAfter?: (movedLabel: string, afterLabel: string) => string;
  /** Announced when a row moves to the top of the grid. */
  readonly movedToTop?: (movedLabel: string) => string;
}

/** Imperative handle exposed by `EditableGrid` for move commands and programmatic focus. */
export interface EditableGridHandle {
  /** Moves the row at `index` by `by` places (clamped), announces the move and keeps focus on the row. Throws RangeError for an out-of-range index. */
  move(index: number, by: number): void;
  /** Moves the selected rows (or active row) up or down by one step; returns false when already at the edge. */
  moveSelected(by: -1 | 1): boolean;
  /** Focuses the cell at `(rowId, columnId)`, scrolling it into view when virtualised. */
  focusCell(rowId: string, columnId?: string): void;
  /** Opens edit mode on `coord` (or the active cell) when editable. */
  startEditing(coord?: GridCellCoord): void;
}

/** Props for `EditableGrid`. All visible words and accessible names arrive through props. */
export interface EditableGridProps {
  /** Accessible name of the grid (such as "Rundown for Tue 17 Nov"). */
  readonly label: string;
  readonly columns: readonly GridColumn[];
  readonly rows: readonly GridRow[];
  /** Selected row ids; controlled when supplied, uncontrolled otherwise. */
  readonly selectedRowIds?: ReadonlySet<string>;
  readonly onSelectionChange?: (selectedIds: readonly string[]) => void;
  /** Active (focused) cell; controlled when supplied, uncontrolled otherwise. */
  readonly activeCell?: GridCellCoord | null;
  readonly onActiveCellChange?: (cell: GridCellCoord | null) => void;
  /** Notifies when cell edit mode starts or ends. */
  readonly onEditingChange?: (editing: boolean) => void;
  /** Commits an edited cell value; returning `{ ok: false, message }` keeps edit mode open. */
  readonly onCommitCell?: (
    rowId: string,
    columnId: string,
    value: string,
  ) => GridCommitResult;
  /** Called when one row is reordered by drag or `move(index, by)`. */
  readonly onMoveRow?: (fromIndex: number, toIndex: number) => void;
  /** Called when one or more selected rows move together via `moveSelected(by)`. */
  readonly onMoveRows?: (rowIds: readonly string[], toIndex: number) => void;
  /** Called when a column edge is dragged or adjusted with arrow keys. */
  readonly onColumnResize?: (columnId: string, widthPx: number) => void;
  /** Called when a person tries to edit a cell while `readOnly` is true. */
  readonly onReadOnlyKey?: () => void;
  /** Placeholder shown in an empty header row (such as "Header row — for example ACT TWO"). */
  readonly headerPlaceholder?: string;
  /** Polite move announcements; falls back to the shared sortable announcements when omitted. */
  readonly announcements?: GridAnnouncements;
  /** Disables editing and row dragging while keeping navigation and reading active. */
  readonly readOnly?: boolean;
  /** Surface scope whose command shortcuts dispatch inside the grid (default `"rundown_grid"`; `null` disables). */
  readonly surface?: SurfaceId | null;
  /** Command definitions matched for `surface` (defaults to `COMMANDS`). */
  readonly surfaceCommands?: readonly CommandDefinition[];
  /** Tour target attribute on `role="grid"` (default `"rundown:grid"`). */
  readonly tourTarget?: string;
  readonly className?: string;
  readonly ref?: Ref<EditableGridHandle>;
}
