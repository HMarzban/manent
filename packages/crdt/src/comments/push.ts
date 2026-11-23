// What a change to a comments document wrote, read from the structs it added and deleted, never from the whole map.
import * as Y from "yjs";
import { yDocOf } from "../doc.ts";
import type { CrdtDoc } from "../doc.ts";
import { COMMENTS_DOC_MAPS } from "../index-maps.ts";
import type { TransactionReport } from "../inspect.ts";
import { updateMeta } from "../updates.ts";

/** One of a comments document's maps. */
export type CommentsMap = (typeof COMMENTS_DOC_MAPS)[number];

/**
 * One entry a change wrote. `value` is what the map holds at `key` after it, null when the entry is gone;
 * `replaced` is true when the key held an entry before the change, or the change wrote inside the entry's value.
 */
export interface CommentsWrite {
  map: CommentsMap;
  key: string;
  value: unknown;
  replaced: boolean;
}

/** A comments map the document holds, by name. */
type Maps = ReadonlyMap<CommentsMap, Y.Map<unknown>>;

/** What a change did at one key: the items it wrote there, and whether it deleted another or wrote inside the value. */
interface Touch {
  written: Set<Y.Item>;
  deletedOther: boolean;
  inside: boolean;
}

/** The map and key of the entry `item` is, or sits inside the value of, and which; null outside every entry. */
function placeOf(
  item: Y.Item,
  maps: Maps,
): { map: CommentsMap; key: string; inside: boolean } | null {
  const { parent } = item;
  if (!(parent instanceof Y.AbstractType)) return null;
  for (const [map, ymap] of maps)
    if (parent === ymap)
      return item.parentSub === null
        ? null
        : { map, key: item.parentSub, inside: false };
  let top = parent;
  while (top.parent !== null && top.parent.parent !== null) top = top.parent;
  for (const [map, ymap] of maps) {
    if (top.parent !== ymap) continue;
    // only a change that put a type into an entry, which is never JSON, makes this walk over the map
    for (const [key, value] of ymap.entries())
      if (value === top) return { map, key, inside: true };
  }
  return null;
}

/** Calls `visit` with each of `client`'s structs that overlaps the clocks from `from` up to, not including, `to`. */
function eachStruct(
  ydoc: Y.Doc,
  client: number,
  from: number,
  to: number,
  visit: (struct: Y.Item | Y.GC) => void,
): void {
  const structs = ydoc.store.clients.get(client) ?? [];
  const last = structs.at(-1);
  if (last === undefined || from >= last.id.clock + last.length) return;
  for (let at = Y.findIndexSS(structs, from); at < structs.length; at++) {
    const struct = structs[at];
    if (struct === undefined || struct.id.clock >= to) return;
    visit(struct);
  }
}

/** What the change did at `key`; null when the key holds what it held before. */
function writeAt(
  ymap: Y.Map<unknown>,
  map: CommentsMap,
  key: string,
  touch: Touch,
): CommentsWrite | null {
  const written = [...touch.written];
  const holds = ymap.has(key);
  // the change's writes at the key all lost to an entry it never wrote
  if (holds && !touch.inside && written.every((item) => item.deleted))
    return null;
  // a key's items are chained in order, so any item older than the change sits just before one of its own
  const replaced =
    touch.inside ||
    touch.deletedOther ||
    written.some((item) => item.left !== null && !touch.written.has(item.left));
  // what it wrote at a new key, it also removed
  if (!holds && !replaced) return null;
  return { map, key, value: holds ? ymap.get(key) : null, replaced };
}

/**
 * The entries of `threads`, `items`, `rounds` and `flags` that the reported change wrote or deleted, in that map
 * order and by key ascending. `doc` is the document the change was applied to. A write inside an entry's value is
 * reported as a write of that entry; a struct a map holds under no key is not reported.
 */
export function readCommentsPush(
  doc: CrdtDoc,
  report: TransactionReport,
): CommentsWrite[] {
  const ydoc = yDocOf(doc);
  const maps: Maps = new Map(
    COMMENTS_DOC_MAPS.flatMap((name) =>
      ydoc.share.has(name) ? [[name, ydoc.getMap<unknown>(name)] as const] : [],
    ),
  );
  const ranges = updateMeta(report.update);
  const isWritten = ({ id }: Y.Item): boolean =>
    ranges.some(
      (range) =>
        range.clientId === id.client &&
        id.clock >= range.fromClock &&
        id.clock < range.toClock,
    );
  const touched = new Map<CommentsMap, Map<string, Touch>>();
  const touch = (struct: Y.Item | Y.GC): void => {
    if (!(struct instanceof Y.Item)) return;
    const place = placeOf(struct, maps);
    if (place === null) return;
    const keys = touched.get(place.map) ?? new Map<string, Touch>();
    touched.set(place.map, keys);
    const at = keys.get(place.key) ?? {
      written: new Set<Y.Item>(),
      deletedOther: false,
      inside: false,
    };
    keys.set(place.key, at);
    if (place.inside) at.inside = true;
    else if (isWritten(struct)) at.written.add(struct);
    else at.deletedOther = true;
  };
  for (const { clientId, fromClock, toClock } of ranges)
    eachStruct(ydoc, clientId, fromClock, toClock, touch);
  for (const [client, deleted] of Y.decodeUpdate(report.update).ds.clients)
    for (const { clock, len } of deleted)
      eachStruct(ydoc, client, clock, clock + len, touch);
  return [...maps].flatMap(([map, ymap]) => {
    const keys = touched.get(map) ?? new Map<string, Touch>();
    return [...keys.keys()].toSorted().flatMap((key) => {
      const at = keys.get(key);
      return (at === undefined ? null : writeAt(ymap, map, key, at)) ?? [];
    });
  });
}
