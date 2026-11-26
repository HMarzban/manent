// One list a person reorders by pointer or keyboard; a command moves an item through its handle.
import {
  memo,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import type { ReactNode, Ref } from "react";
import { SORTABLE_WORDS } from "../../words/sortable.ts";
import { VirtualRows } from "../row/virtual-rows.tsx";
import { useFollowFocus } from "./follow-focus.ts";
import type { Place, SortableEntry } from "./landing.ts";
import { SortableArea } from "./sortable-area.tsx";
import { SortableItem } from "./sortable-item.tsx";
import type { Orientation } from "./sortable-item.tsx";

// the one list's id; an item's id never resolves to it, since items are looked up first
const LIST_ID = "list";

// the library scrolls a keyboard drag by layout offsets, which a virtual row's transform hides from it: while the
// keys drag, the list is no scroll container to it, and the drag scrolls the target into view itself
const VERTICAL_AREA =
  "h-full [&[data-dragging=keyboard]_[role=list]]:overflow-hidden";

/** What a consumer's move commands call: no key is bound here. */
export interface SortableListHandle {
  /** Moves the item at `index` by `by` places, stopping at either end, and says where it went. Throws a RangeError for an index with no item. */
  move(index: number, by: number): void;
}

interface SortableListProps {
  items: readonly SortableEntry[];
  onMove(fromIndex: number, toIndex: number): void;
  renderItem(id: string): ReactNode;
  /** A vertical list is a `VirtualRows`, so only its drawn rows can be dragged; a grid wraps its items. */
  orientation: Orientation;
  /** Accessible name of the list. */
  label?: string;
  /** Row index to keep softly in view while the person scrolls the script (ghost follow). */
  followIndex?: number | null;
  ref?: Ref<SortableListHandle>;
}

interface RenderedItemProps {
  id: string;
  index: number;
  orientation: Orientation;
  renderItem(id: string): ReactNode;
}

const RenderedItem = memo(function RenderedItem({
  id,
  index,
  orientation,
  renderItem,
}: RenderedItemProps): ReactNode {
  return (
    <SortableItem
      id={id}
      index={index}
      group={LIST_ID}
      orientation={orientation}
    >
      {renderItem(id)}
    </SortableItem>
  );
});

/** Drags an item to a new place in the list by pointer or keyboard, saying each move to a screen reader. */
export function SortableList({
  items,
  onMove,
  renderItem,
  orientation,
  label,
  followIndex,
  ref,
}: SortableListProps): ReactNode {
  const focus = useFollowFocus(items);
  // a move by command is no drag, so the library does not say it: this region does
  const [said, setSaid] = useState("");
  useImperativeHandle(
    ref,
    () => ({
      move(index, by) {
        const item = items[index];
        if (item === undefined)
          throw new RangeError(
            `a sortable list of ${items.length} has no item at ${index}`,
          );
        const to = Math.min(items.length - 1, Math.max(0, index + by));
        if (to === index) return;
        setSaid(SORTABLE_WORDS.moved(item.label, to + 1, items.length));
        focus.follow(item.id);
        onMove(index, to);
      },
    }),
    [items, onMove, focus],
  );

  const lists = useMemo(() => [{ id: LIST_ID, items }], [items]);
  const handleDrop = useCallback(
    (_itemId: string, from: Place, to: Place) => onMove(from.index, to.index),
    [onMove],
  );

  const item = (index: number): ReactNode => {
    const entry = items[index];
    return entry === undefined ? null : (
      <RenderedItem
        key={entry.id}
        id={entry.id}
        index={index}
        orientation={orientation}
        renderItem={renderItem}
      />
    );
  };

  return (
    <SortableArea
      lists={lists}
      area={focus.area}
      className={orientation === "vertical" ? VERTICAL_AREA : undefined}
      onDrop={handleDrop}
    >
      {orientation === "vertical" ? (
        <VirtualRows
          count={items.length}
          rowHeight="one"
          label={label ?? ""}
          renderRow={item}
          followIndex={followIndex}
        />
      ) : (
        <div
          role="list"
          aria-label={label || undefined}
          className="@container grid grid-cols-1 gap-2.5 @[28rem]:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]"
        >
          {items.map((entry, index) => (
            <div key={entry.id} role="listitem" className="min-w-0">
              {item(index)}
            </div>
          ))}
        </div>
      )}
      <div role="status" className="sr-only">
        {said}
      </div>
    </SortableArea>
  );
}
