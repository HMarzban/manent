// Lists side by side whose items a person drags within a list and from one list to another; commands move an item
// through its handle.
import { useDroppable } from "@dnd-kit/react";
import { useImperativeHandle, useState } from "react";
import type { ReactNode, Ref } from "react";
import { SORTABLE_WORDS } from "../../words/sortable.ts";
import { useFollowFocus } from "./follow-focus.ts";
import { placeOf } from "./landing.ts";
import type { EntryList } from "./landing.ts";
import { SortableArea } from "./sortable-area.tsx";
import { DropIndicator, SortableItem } from "./sortable-item.tsx";

// below an item's priority, so the pointer over an item lands by that item and only the list's free space lands last
const LIST_COLLISION_PRIORITY = 1;

/** What a consumer's move commands call on multi-list containers: no key is bound here. */
export interface SortableListsHandle {
  /** Moves `itemId` to `toListId` at `toIndex` (clamped), and announces where it went. Throws RangeError when unknown. */
  move(itemId: string, toListId: string, toIndex: number): void;
}

interface ItemListProps {
  list: EntryList;
  renderItem(id: string): ReactNode;
}

function ItemList({ list, renderItem }: ItemListProps): ReactNode {
  const { ref } = useDroppable({
    id: list.id,
    collisionPriority: LIST_COLLISION_PRIORITY,
  });
  return (
    <div
      ref={ref}
      role="list"
      aria-label={list.label}
      className="relative flex min-h-row min-w-0 flex-1 flex-col"
    >
      {list.items.map((entry, index) => (
        <div key={entry.id} role="listitem">
          <SortableItem
            id={entry.id}
            index={index}
            group={list.id}
            orientation="vertical"
          >
            {renderItem(entry.id)}
          </SortableItem>
        </div>
      ))}
      <DropIndicator id={list.id} layout="list" />
    </div>
  );
}

interface SortableListsProps {
  /** A list's id and its items' ids share one namespace. */
  lists: readonly EntryList[];
  onMove(itemId: string, toListId: string, toIndex: number): void;
  renderItem(id: string): ReactNode;
  label?: string;
  ref?: Ref<SortableListsHandle>;
}

/** Drags an item within its list or into another by pointer or keyboard, saying each move to a screen reader. */
export function SortableLists({
  lists,
  onMove,
  renderItem,
  label,
  ref,
}: SortableListsProps): ReactNode {
  const focus = useFollowFocus(lists);
  const [said, setSaid] = useState("");
  useImperativeHandle(
    ref,
    () => ({
      move(itemId, toListId, toIndex) {
        const from = placeOf(lists, itemId);
        if (from === null)
          throw new RangeError(`sortable lists hold no item ${itemId}`);
        const target = lists.find((list) => list.id === toListId);
        if (target === undefined)
          throw new RangeError(`sortable lists hold no list ${toListId}`);
        const maxIndex =
          from.listId === toListId
            ? target.items.length - 1
            : target.items.length;
        const clamped = Math.min(Math.max(0, maxIndex), Math.max(0, toIndex));
        if (from.listId === toListId && clamped === from.index) return;
        const item = lists.find((list) => list.id === from.listId)?.items[
          from.index
        ];
        if (item !== undefined) {
          const count =
            from.listId === toListId
              ? target.items.length
              : target.items.length + 1;
          setSaid(SORTABLE_WORDS.moved(item.label, clamped + 1, count));
        }
        focus.follow(itemId);
        onMove(itemId, toListId, clamped);
      },
    }),
    [lists, onMove, focus],
  );
  return (
    <SortableArea
      lists={lists}
      area={focus.area}
      label={label}
      className="flex gap-3"
      onDrop={(itemId, _from, to) => onMove(itemId, to.listId, to.index)}
    >
      {lists.map((list) => (
        <ItemList key={list.id} list={list} renderItem={renderItem} />
      ))}
      <div role="status" className="sr-only">
        {said}
      </div>
    </SortableArea>
  );
}
