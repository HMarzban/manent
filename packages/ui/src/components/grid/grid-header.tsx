// Sticky column header row and accessible pointer/keyboard column resize edges.
import { cn } from "cn";
import { useRef } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import {
  clampColumnWidth,
  columnBounds,
  columnStyle,
  resolveColumnWidth,
} from "./navigation.ts";
import type { GridColumn } from "./types.ts";

const KEY_STEP_PX = 8;
const SHIFT_STEP_PX = 24;

interface ColumnResizeHandleProps {
  readonly column: GridColumn;
  onResize(columnId: string, widthPx: number): void;
}

function ColumnResizeHandle({
  column,
  onResize,
}: ColumnResizeHandleProps): ReactNode {
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const { min, max } = columnBounds(column);
  const width = resolveColumnWidth(column);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const active = drag.current;
    if (active === null || active.pointerId !== event.pointerId) return;
    const next = clampColumnWidth(
      column,
      active.startWidth + (event.clientX - active.startX),
    );
    if (next !== width) onResize(column.id, next);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const active = drag.current;
    if (active === null || active.pointerId !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? SHIFT_STEP_PX : KEY_STEP_PX;
    let next: number | null = null;
    if (event.key === "ArrowLeft")
      next = clampColumnWidth(column, width - step);
    else if (event.key === "ArrowRight")
      next = clampColumnWidth(column, width + step);
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (next !== width) onResize(column.id, next);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={column.resizeLabel ?? column.accessibleLabel ?? column.label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-valuetext={column.resizeValueText?.(width)}
      tabIndex={0}
      data-resize-handle={column.id}
      className="group/resize absolute inset-y-0 end-0 flex w-2 cursor-col-resize items-stretch justify-end select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <span
        aria-hidden="true"
        className="w-0.5 bg-transparent transition-colors group-hover/resize:bg-accent-solid group-focus-visible/resize:bg-accent-solid"
      />
    </div>
  );
}

interface GridHeaderProps {
  readonly columns: readonly GridColumn[];
  readonly onColumnResize?: (columnId: string, widthPx: number) => void;
}

export function GridHeader({
  columns,
  onColumnResize,
}: GridHeaderProps): ReactNode {
  return (
    <div role="rowgroup" className="sticky top-0 z-10 bg-chrome">
      <div
        role="row"
        aria-rowindex={1}
        className="mn-table-head flex w-full items-stretch border-b border-line"
      >
        {columns.map((column, colIndex) => {
          const resizable =
            onColumnResize !== undefined && column.resizable !== false;
          return (
            <div
              key={column.id}
              role="columnheader"
              aria-colindex={colIndex + 1}
              style={columnStyle(column)}
              className={cn(
                "relative flex min-h-row min-w-0 items-center border-e border-line px-3 last:border-e-0",
                column.numeric && "mn-num",
              )}
            >
              {column.accessibleLabel === undefined ? (
                <span className="truncate">{column.label}</span>
              ) : (
                <>
                  <span aria-hidden="true" className="truncate">
                    {column.label}
                  </span>
                  <span className="sr-only">{column.accessibleLabel}</span>
                </>
              )}
              {resizable ? (
                <ColumnResizeHandle column={column} onResize={onColumnResize} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
