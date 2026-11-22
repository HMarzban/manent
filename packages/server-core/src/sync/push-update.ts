// What the write path reads of a pushed update, and the append it becomes.
import { CrdtUpdateError } from "@manent/crdt";
import type { AppendItem, UpdateOrigin } from "@manent/storage";
import type { Room } from "./rooms.ts";

/** What `fn` gives; "bad" when the bytes it read are not a whole update. */
export function readUpdate<T>(fn: () => T): T | "bad" {
  try {
    return fn();
  } catch (error) {
    if (error instanceof CrdtUpdateError) return "bad";
    throw error;
  }
}

/** A client id's clock range in an update, `fromClock` inclusive and `toClock` exclusive. */
export interface Meta {
  clientId: number;
  fromClock: number;
  toClock: number;
}

export function appendOf(
  room: Room,
  userId: string,
  update: Uint8Array,
  origin: UpdateOrigin,
  metas: readonly Meta[],
): AppendItem {
  const { docId, row } = room;
  const clocks = metas.map((m) => ({ clientId: m.clientId, clock: m.toClock }));
  return { docId, generation: row.generation, update, userId, origin, clocks };
}
