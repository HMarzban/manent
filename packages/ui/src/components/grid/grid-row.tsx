// One sortable grid row: uses the shared sortable drop mark and `.mn-row` states without a listitem role.
import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import { useSortable } from "@dnd-kit/react/sortable";
import { cn } from "cn";
import { useCallback, useLayoutEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useDropMark } from "../sortable/sortable-area.tsx";
import { GridCellView } from "./grid-cell.tsx";
import { cellFor, columnStyle, isCellEditable } from "./navigation.ts";
import type { GridColumn, GridRow } from "./types.ts";

// without dnd-kit's optimistic DOM sorting, matching SortableItem
const ITEM_PLUGINS = [SortableKeyboardPlugin];

function presenceColumnIndex(columns: readonly GridColumn[]): number {
  const primary = columns.findIndex((column) => column.primary === true);
  if (primary !== -1) return primary;
  const nonNumeric = columns.findIndex(
    (column) => !column.numeric && column.label !== "#",
  );
  return nonNumeric !== -1 ? nonNumeric : 0;
}

export interface GridRowViewProps {
  readonly row: GridRow;
  readonly index: number;
  readonly group: string;
  readonly columns: readonly GridColumn[];
  readonly draggable: boolean;
  readonly readOnly: boolean;
  readonly selected: boolean;
  readonly activeColumnId: string | null;
  readonly editingColumnId: string | null;
  readonly draft: string;
  readonly initialKey: string | null;
  readonly editError: string | null;
  readonly headerPlaceholder?: string;
  readonly virtualStart: number | null;
  readonly measureElement?: (element: Element | null) => void;
  onActivateCell(
    rowId: string,
    columnId: string,
    event: ReactMouseEvent<HTMLDivElement>,
  ): void;
  onStartEdit(rowId: string, columnId: string): void;
  onDraftChange(next: string): void;
  onCommitEdit(direction: "down" | "right" | "left" | "none"): boolean;
  onCancelEdit(): void;
}

export function GridRowView({
  row,
  index,
  group,
  columns,
  draggable,
  readOnly,
  selected,
  activeColumnId,
  editingColumnId,
  draft,
  initialKey,
  editError,
  headerPlaceholder,
  virtualStart,
  measureElement,
  onActivateCell,
  onStartEdit,
  onDraftChange,
  onCommitEdit,
  onCancelEdit,
}: GridRowViewProps): ReactNode {
  const editingThisRow = editingColumnId !== null;
  const sortableEnabled =
    draggable && !editingThisRow && row.unavailable === undefined;
  const { ref, isDragging } = useSortable({
    id: row.id,
    index,
    group,
    disabled: !sortableEnabled,
    plugins: ITEM_PLUGINS,
  });
  const mark = useDropMark();
  const dropBefore = mark?.id === row.id && mark.edge === "before";
  const dropAfter = mark?.id === row.id && mark.edge === "after";
  const rowRef = useRef<HTMLDivElement | null>(null);

  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      rowRef.current = node;
      ref(sortableEnabled ? node : null);
      if (virtualStart !== null) measureElement?.(node);
    },
    [ref, sortableEnabled, virtualStart, measureElement],
  );

  useLayoutEffect(() => {
    const node = rowRef.current;
    if (node === null) return;
    ref(sortableEnabled ? node : null);
    if (!sortableEnabled && row.unavailable === undefined) {
      node.removeAttribute("aria-disabled");
    }
  }, [ref, sortableEnabled, row.unavailable]);

  const firstColumn = columns[0];
  if (firstColumn === undefined) return null;

  const isHeader = row.kind === "header";
  const lastIndex = columns.length - 1;
  const presenceColIndex = presenceColumnIndex(columns);

  return (
    <div
      ref={attach}
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected ? "true" : "false"}
      aria-current={row.current ? "true" : undefined}
      aria-disabled={row.unavailable !== undefined ? "true" : undefined}
      title={row.unavailable}
      data-sortable-id={row.id}
      data-row-id={row.id}
      data-index={index}
      style={
        virtualStart === null
          ? undefined
          : {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualStart}px)`,
            }
      }
      className={cn(
        "mn-row flex w-full items-stretch rounded-none border-b border-line text-ui",
        !selected &&
          !row.current &&
          row.unavailable === undefined &&
          "hover:bg-subtle",
        selected && "ring-1 ring-inset ring-focus",
        row.unavailable !== undefined && "cursor-not-allowed text-fg-muted",
        isDragging &&
          "z-20 rounded-control border border-line bg-overlay shadow-overlay",
        dropBefore && "border-t-2 border-t-accent-solid",
        dropAfter && "border-b-2 border-b-accent-solid",
      )}
    >
      {isHeader ? (
        <GridCellView
          rowId={row.id}
          column={firstColumn}
          colIndex={0}
          colSpan={columns.length}
          isHeader={true}
          cell={cellFor(row, firstColumn)}
          active={activeColumnId !== null}
          editable={isCellEditable(row, firstColumn, readOnly)}
          editing={editingColumnId !== null}
          draft={draft}
          initialKey={initialKey}
          editError={editError}
          headerPlaceholder={headerPlaceholder}
          rowMenu={row.menu}
          onActivate={(event) => onActivateCell(row.id, firstColumn.id, event)}
          onStartEdit={() => onStartEdit(row.id, firstColumn.id)}
          onDraftChange={onDraftChange}
          onCommit={onCommitEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        columns.map((column, colIndex) => {
          const cell = cellFor(row, column);
          const isEditing = editingColumnId === column.id;
          const rowPresence =
            colIndex === presenceColIndex && row.presence !== undefined
              ? row.presence
              : undefined;
          const mergedCell =
            rowPresence === undefined
              ? cell
              : {
                  ...cell,
                  presence:
                    cell.presence === undefined ? (
                      rowPresence
                    ) : (
                      <>
                        {cell.presence}
                        {rowPresence}
                      </>
                    ),
                };
          return (
            <GridCellView
              key={column.id}
              rowId={row.id}
              column={column}
              colIndex={colIndex}
              isHeader={false}
              cell={mergedCell}
              style={columnStyle(column)}
              active={activeColumnId === column.id}
              editable={isCellEditable(row, column, readOnly)}
              editing={isEditing}
              draft={draft}
              initialKey={initialKey}
              editError={editError}
              rowMenu={colIndex === lastIndex ? row.menu : undefined}
              leading={colIndex === 0}
              onActivate={(event) => onActivateCell(row.id, column.id, event)}
              onStartEdit={() => onStartEdit(row.id, column.id)}
              onDraftChange={onDraftChange}
              onCommit={onCommitEdit}
              onCancel={onCancelEdit}
            />
          );
        })
      )}
    </div>
  );
}
