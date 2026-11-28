// Editable rundown grid: cell keys, virtual rows, sortable rows, sticky header, column resize and corner marks.
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "cn";
import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { SortableArea } from "../sortable/sortable-area.tsx";
import { GridHeader } from "./grid-header.tsx";
import { GridRowView } from "./grid-row.tsx";
import { GridSurfaceKeys } from "./grid-surface-keys.tsx";
import type { SurfaceKeyRunner } from "./grid-surface-keys.tsx";
import { totalMinWidthPx } from "./navigation.ts";
import type { EditableGridProps } from "./types.ts";
import { ROW_PX, useGridController } from "./use-grid-controller.ts";

const GRID_LIST_ID = "grid-rows";
const PLAIN_LIMIT = 100;
const VERTICAL_AREA =
  "h-full [&[data-dragging=keyboard]_[data-grid-scroll]]:overflow-hidden";

/**
 * Editable data grid with cell navigation, inline editing, virtual rows, sortable rows and resizable columns.
 * Holds no visible words: every heading, accessible name, placeholder and custom move announcement arrives via props.
 */
export function EditableGrid(props: EditableGridProps): ReactNode {
  const {
    label,
    columns,
    rows,
    onMoveRow,
    onColumnResize,
    headerPlaceholder,
    readOnly = false,
    surface = "rundown_grid",
    surfaceCommands,
    tourTarget = "rundown:grid",
    className,
  } = props;

  const visibleColumns = useMemo(
    () => columns.filter((column) => !column.hidden),
    [columns],
  );
  const minWidthPx = useMemo(
    () => totalMinWidthPx(visibleColumns),
    [visibleColumns],
  );
  const sortableItems = useMemo(
    () => rows.map((row) => ({ id: row.id, label: row.label })),
    [rows],
  );

  const areaRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const surfaceRunnerRef = useRef<SurfaceKeyRunner | null>(null);
  const [scrolledY, setScrolledY] = useState(false);

  const virtual = rows.length > PLAIN_LIMIT;
  const virtualizer = useVirtualizer({
    count: rows.length,
    enabled: virtual,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_PX,
    measureElement: (element) =>
      element?.getBoundingClientRect().height || ROW_PX,
  });

  const controller = useGridController({
    props,
    visibleColumns,
    virtual,
    scrollToIndex: (index) => virtualizer.scrollToIndex(index),
    areaRef,
    scrollRef,
    surfaceRunnerRef,
  });

  const draggable = !readOnly && onMoveRow !== undefined;

  const renderRowAt = (
    index: number,
    virtualStart: number | null,
  ): ReactNode => {
    const row = rows[index];
    if (row === undefined) return null;
    const isActiveRow = controller.resolvedCoord?.rowId === row.id;
    const isEditingRow = controller.editing?.rowId === row.id;
    return (
      <GridRowView
        key={row.id}
        row={row}
        index={index}
        group={GRID_LIST_ID}
        columns={visibleColumns}
        draggable={draggable}
        readOnly={readOnly}
        selected={controller.selectedIds.has(row.id)}
        activeColumnId={
          isActiveRow ? (controller.resolvedCoord?.columnId ?? null) : null
        }
        editingColumnId={isEditingRow ? controller.editing.columnId : null}
        draft={isEditingRow ? controller.editing.draft : ""}
        initialKey={isEditingRow ? controller.editing.initialKey : null}
        editError={isEditingRow ? controller.editing.error : null}
        headerPlaceholder={headerPlaceholder}
        virtualStart={virtualStart}
        measureElement={virtualizer.measureElement}
        onActivateCell={controller.onActivateCell}
        onStartEdit={(rowId, columnId) =>
          controller.beginEdit(rowId, columnId, null)
        }
        onDraftChange={controller.setDraft}
        onCommitEdit={controller.commitEdit}
        onCancelEdit={controller.cancelEdit}
      />
    );
  };

  return (
    <SortableArea
      lists={[{ id: GRID_LIST_ID, items: sortableItems }]}
      area={areaRef}
      className={cn(VERTICAL_AREA, className)}
      onDrop={(_itemId, from, to) => onMoveRow?.(from.index, to.index)}
    >
      {surface === null ? null : (
        <GridSurfaceKeys
          surface={surface}
          commands={surfaceCommands}
          runnerRef={surfaceRunnerRef}
        />
      )}
      <div
        ref={scrollRef}
        data-grid-scroll=""
        data-scrolled-y={scrolledY ? "true" : undefined}
        data-ring="inset"
        className="relative h-full overflow-auto overscroll-contain bg-raised text-ui text-fg"
        onScroll={(event) => {
          const next = event.currentTarget.scrollTop > 0;
          setScrolledY((prev) => (prev === next ? prev : next));
        }}
      >
        <div
          role="grid"
          aria-label={label}
          aria-rowcount={rows.length + 1}
          aria-colcount={visibleColumns.length}
          aria-multiselectable="true"
          data-tour={tourTarget}
          style={{ minWidth: `${minWidthPx}px` }}
          className="w-full"
          onKeyDown={controller.onGridKeyDown}
        >
          <GridHeader
            columns={visibleColumns}
            onColumnResize={onColumnResize}
          />
          <div
            role="rowgroup"
            style={
              virtual
                ? { position: "relative", height: virtualizer.getTotalSize() }
                : undefined
            }
          >
            {virtual
              ? virtualizer
                  .getVirtualItems()
                  .map((item) => renderRowAt(item.index, item.start))
              : rows.map((_row, index) => renderRowAt(index, null))}
          </div>
        </div>
      </div>
      <div role="status" className="sr-only">
        {controller.said}
      </div>
    </SortableArea>
  );
}
