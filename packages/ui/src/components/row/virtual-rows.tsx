// A list of rows that reports its true size, and is virtual once it is long.
import { useVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useReducer, useRef } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";

const PLAIN_LIMIT = 100;
// the row tokens at Interface size 100 %, until a row is measured
const ROW_PX = { one: 28, two: 44 } as const;

type RowHeight = keyof typeof ROW_PX;

interface VirtualRowsProps {
  count: number;
  rowHeight: RowHeight;
  label: string;
  renderRow(index: number): ReactNode;
  /** Called with the index a key moved to. */
  onKeyMove?(index: number): void;
}

const STEPS: Readonly<
  Record<string, (from: number, page: number, last: number) => number>
> = {
  ArrowDown: (from) => from + 1,
  ArrowUp: (from) => from - 1,
  PageDown: (from, page) => from + page,
  PageUp: (from, page) => from - page,
  Home: () => 0,
  End: (_from, _page, last) => last,
};

const sizeOf = (element: Element | null, rowHeight: RowHeight): number =>
  element?.getBoundingClientRect().height || ROW_PX[rowHeight];

// the index a key moves to, counted from the focused row's place in the list, never from the DOM's order
const keyTarget = (
  event: KeyboardEvent<HTMLElement>,
  count: number,
  rowHeight: RowHeight,
): number | null => {
  const step = STEPS[event.key];
  if (step === undefined || count === 0 || !(event.target instanceof Element))
    return null;
  const item = event.target.closest('[role="listitem"]');
  const from =
    item === null ? -1 : Number(item.getAttribute("aria-posinset")) - 1;
  const page = Math.max(
    1,
    Math.floor(event.currentTarget.clientHeight / sizeOf(item, rowHeight)),
  );
  return Math.min(count - 1, Math.max(0, step(from, page, count - 1)));
};

const drawnRow = (
  list: HTMLElement | null,
  index: number,
): HTMLElement | null => {
  const row = list?.querySelector(
    `[aria-posinset="${index + 1}"] .mn-row[tabindex]`,
  );
  return row instanceof HTMLElement ? row : null;
};

// focuses the row at an index now when it is drawn, else on the first render that draws it
function useFocusLater(
  listRef: RefObject<HTMLElement | null>,
): (index: number) => void {
  const pending = useRef<number | null>(null);
  const [, redraw] = useReducer((renders: number) => renders + 1, 0);
  useLayoutEffect(() => {
    if (pending.current === null) return;
    const row = drawnRow(listRef.current, pending.current);
    if (row === null) return;
    pending.current = null;
    row.focus({ preventScroll: true });
  });
  return (index) => {
    const row = drawnRow(listRef.current, index);
    pending.current = row === null ? index : null;
    if (row === null) redraw();
    else row.focus({ preventScroll: true });
  };
}

interface ListItemProps {
  index: number;
  count: number;
  /** The row's offset in px inside a virtual list; null in a plain one. */
  start: number | null;
  measure: (element: Element | null) => void;
  children: ReactNode;
}

function ListItem({
  index,
  count,
  start,
  measure,
  children,
}: ListItemProps): ReactNode {
  return (
    <div
      role="listitem"
      aria-setsize={count}
      aria-posinset={index + 1}
      data-index={index}
      ref={start === null ? undefined : measure}
      style={
        start === null
          ? undefined
          : {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${start}px)`,
            }
      }
    >
      {children}
    </div>
  );
}

/** Plain rows up to 100, virtual above; keys move by index, so End reaches the last row that is not drawn yet. */
export function VirtualRows({
  count,
  rowHeight,
  label,
  renderRow,
  onKeyMove,
}: VirtualRowsProps): ReactNode {
  const listRef = useRef<HTMLDivElement>(null);
  const focusLater = useFocusLater(listRef);
  const virtual = count > PLAIN_LIMIT;
  const virtualizer = useVirtualizer({
    count,
    enabled: virtual,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_PX[rowHeight],
    measureElement: (element) => sizeOf(element, rowHeight),
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const next = keyTarget(event, count, rowHeight);
    if (next === null) return;
    event.preventDefault();
    focusLater(next);
    if (virtual) virtualizer.scrollToIndex(next);
    onKeyMove?.(next);
  };

  const listItem = (index: number, start: number | null): ReactNode => (
    <ListItem
      key={index}
      index={index}
      count={count}
      start={start}
      measure={virtualizer.measureElement}
    >
      {renderRow(index)}
    </ListItem>
  );

  return (
    <div
      ref={listRef}
      role="list"
      aria-label={label}
      // the list scrolls, so a ring drawn outside a row would be cut off
      data-ring="inset"
      className="h-full overflow-auto"
      onKeyDown={onKeyDown}
    >
      {virtual ? (
        <div
          style={{ position: "relative", height: virtualizer.getTotalSize() }}
        >
          {virtualizer
            .getVirtualItems()
            .map((item) => listItem(item.index, item.start))}
        </div>
      ) : (
        Array.from({ length: count }, (_, index) => listItem(index, null))
      )}
    </div>
  );
}
