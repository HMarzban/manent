// The Ruler: an inch scale over the page's text column, with the caret block's indent and right edge as markers.
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";

// the page counts ten cells to the inch
const CELLS_PER_INCH = 10;
const HALF_INCH_CELLS = CELLS_PER_INCH / 2;

type Marker = "indent" | "right";

/** Decorative and pointer only: the same values are fields elsewhere, so the bar is hidden from assistive technology. */
export interface RulerProps {
  /** The text column, cells. */
  readonly columnCells: number;
  readonly cellPx: number;
  /** The column's left edge, px from the bar's left. */
  readonly originPx: number;
  /** Cells from the column's left edge. */
  readonly indent: number;
  /** Cells. */
  readonly width: number;
  readonly editable: boolean;
  /** Once, when a drag ends somewhere other than where it began. */
  onCommit(change: { readonly indent: number; readonly width: number }): void;
}

type Layout = Parameters<RulerProps["onCommit"]>[0];

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

/** Where a drag of `marker` to `cell` leaves the block: the indent keeps the right edge, the right edge keeps the indent. */
function dragged(marker: Marker, cell: number, props: RulerProps): Layout {
  const { columnCells, indent, width } = props;
  if (marker === "right")
    return { indent, width: clamp(cell - indent, 1, columnCells - indent) };
  const moved = clamp(cell, 0, columnCells - 1);
  return { indent: moved, width: Math.max(1, indent + width - moved) };
}

const edgeOf = (marker: Marker, layout: Layout): number =>
  marker === "indent" ? layout.indent : layout.indent + layout.width;

/** A long tick and its number each inch, a short tick each half inch, across the column. */
function Scale(props: { columnCells: number; at(cell: number): number }) {
  const halves = Math.floor(props.columnCells / HALF_INCH_CELLS);
  return Array.from({ length: halves + 1 }, (_, half) => {
    const left = props.at(half * HALF_INCH_CELLS);
    if (half % 2 === 1)
      return (
        <span
          key={half}
          data-tick="half"
          className="absolute bottom-0 h-1 w-px bg-fg-muted"
          style={{ left }}
        />
      );
    return (
      <span key={half} style={{ left }} className="absolute inset-y-0">
        <span className="absolute top-0 -translate-x-1/2 text-micro text-fg-muted">
          {half / 2}
        </span>
        <span
          data-tick="inch"
          className="absolute bottom-0 h-2 w-px bg-fg-muted"
        />
      </span>
    );
  });
}

/** A drag in progress: the marker, where the pointer pressed it, and the cell its edge stood on then. */
interface Drag {
  readonly marker: Marker;
  readonly startX: number;
  readonly startCell: number;
}

/**
 * A drag (pointer capture) moves only a guide line, by the cells the pointer has travelled since the press, so a press
 * off the marker's centre moves nothing; when it ends that cell commits, the indent clamped to the column and the width
 * to at least one cell inside it. Escape cancels a drag; a read-only ruler's markers do not move.
 */
export function Ruler(props: RulerProps): ReactNode {
  const { columnCells, cellPx, originPx, indent, width, editable } = props;
  const root = useRef<HTMLDivElement>(null);
  const dragging = useRef<Drag | null>(null);
  const [guidePx, setGuidePx] = useState<number | null>(null);
  const active = guidePx !== null;
  const at = (cell: number): number => originPx + cell * cellPx;

  useEffect(() => {
    const doc = root.current?.ownerDocument;
    if (!active || doc === undefined) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dragging.current = null;
      setGuidePx(null);
    };
    doc.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      doc.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [active]);

  const layoutAt = (drag: Drag, event: PointerEvent): Layout => {
    const cell =
      drag.startCell + Math.round((event.clientX - drag.startX) / cellPx);
    return dragged(drag.marker, cell, props);
  };
  const end = (): void => {
    dragging.current = null;
    setGuidePx(null);
  };
  const handlers = (marker: Marker) => ({
    onPointerDown(event: PointerEvent<HTMLElement>) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const startCell = edgeOf(marker, { indent, width });
      dragging.current = { marker, startX: event.clientX, startCell };
      setGuidePx(at(startCell));
    },
    onPointerMove(event: PointerEvent) {
      const drag = dragging.current;
      if (drag?.marker !== marker) return;
      setGuidePx(at(edgeOf(marker, layoutAt(drag, event))));
    },
    onPointerUp(event: PointerEvent) {
      const drag = dragging.current;
      if (drag?.marker !== marker) return;
      end();
      const change = layoutAt(drag, event);
      if (change.indent !== indent || change.width !== width)
        props.onCommit(change);
    },
    onPointerCancel() {
      if (dragging.current?.marker === marker) end();
    },
  });

  return (
    <div
      ref={root}
      aria-hidden="true"
      className="relative h-control overflow-hidden border-b border-line bg-chrome select-none"
    >
      <Scale columnCells={columnCells} at={at} />
      {(["indent", "right"] as const).map((marker) => (
        <span
          key={marker}
          data-marker={marker}
          className={cn(
            "absolute bottom-0 h-2.5 w-2 -translate-x-1/2 rounded-sm bg-fg-accent",
            editable && "cursor-ew-resize touch-none",
          )}
          style={{ left: at(edgeOf(marker, { indent, width })) }}
          {...(editable ? handlers(marker) : {})}
        />
      ))}
      {guidePx === null ? null : (
        <span
          data-guide=""
          className="absolute inset-y-0 w-px bg-fg-accent"
          style={{ left: guidePx }}
        />
      )}
    </div>
  );
}
