// Lists side by side whose items a person drags within a list and from one list to another.
import { useDroppable } from "@dnd-kit/react";
import type { ReactNode } from "react";
import type { EntryList } from "./landing.ts";
import { SortableArea } from "./sortable-area.tsx";
import { DropIndicator, SortableItem } from "./sortable-item.tsx";

// below an item's priority, so the pointer over an item lands by that item and only the list's free space lands last
const LIST_COLLISION_PRIORITY = 1;

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
}

/** Drags an item within its list or into another by pointer or keyboard, saying each move to a screen reader. */
export function SortableLists({
  lists,
  onMove,
  renderItem,
}: SortableListsProps): ReactNode {
  return (
    <SortableArea
      lists={lists}
      className="flex gap-3"
      onDrop={(itemId, _from, to) => onMove(itemId, to.listId, to.index)}
    >
      {lists.map((list) => (
        <ItemList key={list.id} list={list} renderItem={renderItem} />
      ))}
    </SortableArea>
  );
}
