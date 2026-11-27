// Lists side by side (or in a 2D grid) whose items a person drags within a list and from one list to another; commands
// move an item through its handle.
import { useDroppable } from "@dnd-kit/react";
import { Fragment, useImperativeHandle, useState } from "react";
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import { SORTABLE_WORDS } from "../../words/sortable.ts";
import { useFollowFocus } from "./follow-focus.ts";
import { placeOf } from "./landing.ts";
import type { EntryList } from "./landing.ts";
import { SortableArea, useDropMark } from "./sortable-area.tsx";
import { DropIndicator, SortableItem } from "./sortable-item.tsx";

// below an item's priority, so the pointer over an item lands by that item and only the list's free space lands last
const LIST_COLLISION_PRIORITY = 1;

/** What a consumer's move commands call on multi-list containers: no key is bound here. */
export interface SortableListsHandle {
  /** Moves `itemId` to `toListId` at `toIndex` (clamped), and announces where it went. Throws RangeError when unknown. */
  move(itemId: string, toListId: string, toIndex: number): void;
}

export type SortableCellProps = HTMLAttributes<HTMLDivElement> &
  Partial<Record<`data-${string}`, string | undefined>>;

interface ItemListProps {
  list: EntryList;
  index: number;
  renderItem(id: string): ReactNode;
  listClassName?: string;
  renderFooter?: (list: EntryList, index: number) => ReactNode;
  getCellProps?: (list: EntryList, index: number) => SortableCellProps;
}

function ItemList({
  list,
  index,
  renderItem,
  listClassName,
  renderFooter,
  getCellProps,
}: ItemListProps): ReactNode {
  const { ref } = useDroppable({
    id: list.id,
    collisionPriority: LIST_COLLISION_PRIORITY,
  });
  const mark = useDropMark();
  const activeTarget =
    mark !== null &&
    (mark.id === list.id || list.items.some((entry) => entry.id === mark.id));
  const items = (
    <>
      {list.items.map((entry, itemIndex) => (
        <div key={entry.id} role="listitem">
          <SortableItem
            id={entry.id}
            index={itemIndex}
            group={list.id}
            orientation="vertical"
          >
            {renderItem(entry.id)}
          </SortableItem>
        </div>
      ))}
      <DropIndicator id={list.id} layout="list" />
    </>
  );
  if (renderFooter === undefined && getCellProps === undefined) {
    return (
      <div
        ref={ref}
        role="list"
        aria-label={list.label}
        data-drop-target={activeTarget ? "active" : undefined}
        className={
          listClassName ?? "relative flex min-h-row min-w-0 flex-1 flex-col"
        }
      >
        {items}
      </div>
    );
  }
  const cellProps = getCellProps?.(list, index);
  return (
    <div
      ref={ref}
      {...cellProps}
      data-drop-target={activeTarget ? "active" : undefined}
    >
      <div
        role="list"
        aria-label={list.label}
        className={listClassName ?? "relative flex min-w-0 flex-col gap-2"}
      >
        {items}
      </div>
      {renderFooter?.(list, index)}
    </div>
  );
}

interface SortableListsProps {
  /** A list's id and its items' ids share one namespace. */
  lists: readonly EntryList[];
  onMove(itemId: string, toListId: string, toIndex: number): void;
  renderItem(id: string): ReactNode;
  label?: string;
  instructions?: string;
  areaClassName?: string;
  areaStyle?: CSSProperties;
  areaDataRing?: string;
  listClassName?: string;
  beforeLists?: ReactNode;
  afterLists?: ReactNode;
  renderBeforeList?: (list: EntryList, index: number) => ReactNode;
  renderListFooter?: (list: EntryList, index: number) => ReactNode;
  getCellProps?: (list: EntryList, index: number) => SortableCellProps;
  ref?: Ref<SortableListsHandle>;
}

/** Drags an item within its list or into another by pointer or keyboard, saying each move to a screen reader. */
export function SortableLists({
  lists,
  onMove,
  renderItem,
  label,
  instructions,
  areaClassName,
  areaStyle,
  areaDataRing,
  listClassName,
  beforeLists,
  afterLists,
  renderBeforeList,
  renderListFooter,
  getCellProps,
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
          setSaid(
            from.listId !== toListId && target.label !== undefined
              ? SORTABLE_WORDS.movedToList(
                  item.label,
                  clamped + 1,
                  count,
                  target.label,
                )
              : SORTABLE_WORDS.moved(item.label, clamped + 1, count),
          );
        }
        focus.follow(itemId);
        onMove(itemId, toListId, clamped);
      },
    }),
    [lists, onMove, focus],
  );
  return (
    <>
      <SortableArea
        lists={lists}
        area={focus.area}
        label={label}
        instructions={instructions}
        className={areaClassName ?? "flex gap-3"}
        style={areaStyle}
        dataRing={areaDataRing}
        onDrop={(itemId, _from, to) => onMove(itemId, to.listId, to.index)}
      >
        {beforeLists}
        {lists.map((list, index) => (
          <Fragment key={list.id}>
            {renderBeforeList?.(list, index)}
            <ItemList
              list={list}
              index={index}
              renderItem={renderItem}
              listClassName={listClassName}
              renderFooter={renderListFooter}
              getCellProps={getCellProps}
            />
          </Fragment>
        ))}
        {afterLists}
      </SortableArea>
      <div role="status" className="sr-only">
        {said}
      </div>
    </>
  );
}
