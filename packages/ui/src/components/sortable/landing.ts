// Where a dragged item lands, worked out from the lists as given, and where the drop indicator is drawn.

export interface SortableEntry {
  id: string;
  /** What the announcements call the item. */
  label: string;
}

export interface EntryList {
  id: string;
  items: readonly SortableEntry[];
}

/** An item's list and its index there, counted from 0. */
export interface Place {
  listId: string;
  index: number;
}

/** The item (or the empty list) whose edge the drop indicator is drawn on. */
export interface DropMark {
  id: string;
  edge: "before" | "after";
}

export function placeOf(
  lists: readonly EntryList[],
  itemId: string,
): Place | null {
  for (const list of lists) {
    const index = list.items.findIndex((item) => item.id === itemId);
    if (index !== -1) return { listId: list.id, index };
  }
  return null;
}

export function entryAt(
  lists: readonly EntryList[],
  place: Place,
): SortableEntry | null {
  return (
    lists.find((list) => list.id === place.listId)?.items[place.index] ?? null
  );
}

/**
 * Where the item lands when dropped on a target. On an item of its own list it takes that item's index; on an item of
 * another list it goes before that item; on a list itself it goes last.
 */
export function landingOf(
  lists: readonly EntryList[],
  from: Place,
  targetId: string,
): Place | null {
  const item = placeOf(lists, targetId);
  if (item !== null) return item;
  const list = lists.find((candidate) => candidate.id === targetId);
  if (list === undefined) return null;
  const index =
    list.id === from.listId ? list.items.length - 1 : list.items.length;
  return { listId: list.id, index };
}

/** How many items the landing list holds once the item is in it. */
export function countAt(
  lists: readonly EntryList[],
  from: Place,
  to: Place,
): number {
  const length = lists.find((list) => list.id === to.listId)?.items.length ?? 0;
  return to.listId === from.listId ? length : length + 1;
}

export function isSamePlace(a: Place, b: Place): boolean {
  return a.listId === b.listId && a.index === b.index;
}

export function dropMarkOf(
  lists: readonly EntryList[],
  from: Place,
  to: Place,
): DropMark | null {
  const list = lists.find((candidate) => candidate.id === to.listId);
  if (list === undefined || isSamePlace(from, to)) return null;
  const { items } = list;
  if (to.listId === from.listId) {
    const id = items[to.index]?.id;
    if (id === undefined) return null;
    return { id, edge: to.index > from.index ? "after" : "before" };
  }
  const next = items[to.index];
  if (next !== undefined) return { id: next.id, edge: "before" };
  const last = items.at(-1);
  return last === undefined
    ? { id: list.id, edge: "before" }
    : { id: last.id, edge: "after" };
}
