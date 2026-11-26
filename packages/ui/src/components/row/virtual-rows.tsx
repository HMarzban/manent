// A list of rows that reports its true size, and is virtual once it is long.
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type { FocusEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import { RowTabStop } from "./tab-stop.ts";

const PLAIN_LIMIT = 100;
// the row tokens at Interface size 100 %, until a row is measured
const ROW_PX = { one: 28, two: 44 } as const;
/** Pause auto-follow after the person scrolls the list themselves. */
const MANUAL_SCROLL_PAUSE_MS = 2500;
/** Extra margin inside the list's top and bottom edges when auto-following a row. */
const FOLLOW_PADDING_PX = 28;

type RowHeight = keyof typeof ROW_PX;

type RangeExtractor = NonNullable<
  Parameters<
    typeof useVirtualizer<HTMLDivElement, Element>
  >[0]["rangeExtractor"]
>;

interface VirtualRowsProps {
  count: number;
  rowHeight: RowHeight;
  label: string;
  renderRow(index: number): ReactNode;
  /** Called with the index a key moved to. */
  onKeyMove?(index: number): void;
  /** Custom virtual range selector passed through to `useVirtualizer`. */
  rangeExtractor?: RangeExtractor;
  /** Gently keeps this row in view when the person is not interacting with the list (ghost follow). */
  followIndex?: number | null;
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

const itemOf = (target: EventTarget | null): Element | null =>
  target instanceof Element ? target.closest('[role="listitem"]') : null;

const indexOf = (item: Element | null): number | null =>
  item === null ? null : Number(item.getAttribute("aria-posinset")) - 1;

// the index a key moves to, counted from the focused row's place in the list, never from the DOM's order
const keyTarget = (
  event: KeyboardEvent<HTMLElement>,
  count: number,
  rowHeight: RowHeight,
): number | null => {
  const step = STEPS[event.key];
  if (
    step === undefined ||
    count === 0 ||
    !(event.target instanceof Element) ||
    !event.currentTarget.contains(event.target)
  )
    return null;
  const item = itemOf(event.target);
  if (item === null && event.target !== event.currentTarget) return null;
  const from = indexOf(item) ?? -1;
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

interface TabStop {
  /** The index of the list's one Tab stop; null until a drawn row is activatable. */
  stop: number | null;
  onFocus(event: FocusEvent<HTMLElement>): void;
}

// the row focused last is the stop; when it is not drawn, the current row is, else the first activatable one
function useTabStop(
  listRef: RefObject<HTMLElement | null>,
  count: number,
  drawnKey: string,
  renderRow: (index: number) => ReactNode,
): TabStop {
  const [stop, setStop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null || list.querySelector('.mn-row[tabindex="0"]') !== null)
      return;
    const row =
      list.querySelector('.mn-row[tabindex][aria-current="true"]') ??
      list.querySelector(".mn-row[tabindex]");
    const index = indexOf(itemOf(row));
    if (index !== null) setStop(index);
    else if (stop !== null) setStop(null);
  }, [listRef, stop, count, drawnKey, renderRow]);
  return {
    stop,
    onFocus(event) {
      const index = indexOf(itemOf(event.target));
      if (index !== null) setStop(index);
    },
  };
}

interface ListItemProps {
  index: number;
  count: number;
  /** Whether this item's row is the list's one Tab stop. */
  stop: boolean;
  /** The row's offset in px inside a virtual list; null in a plain one. */
  start: number | null;
  measure: (element: Element | null) => void;
  children: ReactNode;
}

function ListItem({
  index,
  count,
  stop,
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
      <RowTabStop.Provider value={stop}>{children}</RowTabStop.Provider>
    </div>
  );
}

/**
 * Plain rows up to 100, virtual above; keys move by index, so End reaches the last row that is not drawn yet.
 * Tab enters the list once: only the row last focused, or else the current or first drawn one, is a Tab stop.
 */
export function VirtualRows({
  count,
  rowHeight,
  label,
  renderRow,
  onKeyMove,
  rangeExtractor,
  followIndex,
}: VirtualRowsProps): ReactNode {
  const listRef = useRef<HTMLDivElement>(null);
  const pointerInsideRef = useRef(false);
  const focusInsideRef = useRef(false);
  const manualPauseUntilRef = useRef(0);
  const focusLater = useFocusLater(listRef);
  const virtual = count > PLAIN_LIMIT;
  const virtualizer = useVirtualizer({
    count,
    enabled: virtual,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_PX[rowHeight],
    measureElement: (element) => sizeOf(element, rowHeight),
    ...(rangeExtractor === undefined ? {} : { rangeExtractor }),
  });
  const virtualItems = virtual ? virtualizer.getVirtualItems() : null;
  const drawnKey =
    virtualItems === null
      ? `plain:${count}`
      : `v:${virtualItems.map((item) => item.index).join(",")}`;
  const { stop, onFocus } = useTabStop(listRef, count, drawnKey, renderRow);

  useEffect(() => {
    if (followIndex == null || followIndex < 0 || followIndex >= count) return;
    const list = listRef.current;
    if (list === null) return;
    if (
      pointerInsideRef.current ||
      focusInsideRef.current ||
      Date.now() < manualPauseUntilRef.current ||
      list.closest("[data-dragging]") !== null
    )
      return;
    if (virtual) {
      virtualizer.scrollToIndex(followIndex, { align: "auto" });
      return;
    }
    const item = list.querySelector<HTMLElement>(
      `[aria-posinset="${followIndex + 1}"]`,
    );
    if (item === null) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const pad = Math.min(FOLLOW_PADDING_PX, listRect.height / 4);
    let targetTop: number | null = null;
    if (itemRect.top < listRect.top + pad)
      targetTop = Math.max(
        0,
        list.scrollTop + (itemRect.top - listRect.top - pad),
      );
    else if (itemRect.bottom > listRect.bottom - pad)
      targetTop = Math.max(
        0,
        list.scrollTop + (itemRect.bottom - listRect.bottom + pad),
      );
    if (targetTop === null) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    list.scrollTo({ top: targetTop, behavior: reduced ? "auto" : "smooth" });
  }, [followIndex, count, virtual, virtualizer]);

  const pauseFollow = (): void => {
    manualPauseUntilRef.current = Date.now() + MANUAL_SCROLL_PAUSE_MS;
  };

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
      stop={index === stop}
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
      onFocus={(event) => {
        focusInsideRef.current = true;
        onFocus(event);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          focusInsideRef.current = false;
      }}
      onPointerEnter={() => {
        pointerInsideRef.current = true;
      }}
      onPointerLeave={() => {
        pointerInsideRef.current = false;
      }}
      onMouseEnter={() => {
        pointerInsideRef.current = true;
      }}
      onMouseLeave={() => {
        pointerInsideRef.current = false;
      }}
      onWheel={pauseFollow}
      onTouchMove={pauseFollow}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) pauseFollow();
      }}
    >
      {virtualItems !== null ? (
        <div
          style={{ position: "relative", height: virtualizer.getTotalSize() }}
        >
          {virtualItems.map((item) => listItem(item.index, item.start))}
        </div>
      ) : (
        Array.from({ length: count }, (_, index) => listItem(index, null))
      )}
    </div>
  );
}
