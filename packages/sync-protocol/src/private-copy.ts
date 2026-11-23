// What the private-copy routes answer, and what a client sends them.
import type { BlockJSON } from "./history-http.ts";
import type { ReplaySetAside } from "./http.ts";

/** The body of POST /api/private/create: `docId` is the room's script. */
export interface PrivateCreateRequest {
  docId: string;
}

/** The answer to POST /api/private/create: the writer's open private copy, made when they had none. */
export interface PrivateCreateResponse {
  privateDocId: string;
}

/** The body of POST /api/private/handin, idempotent by `key` (`isReplayKey`). */
export interface HandInRequest {
  docId: string;
  key: string;
}

/**
 * A block both the private copy and the room changed so that the changes touch: the room keeps `theirs`, and `mine`,
 * the private copy's wording, is listed under To review. `otherUserIds` changed the room's block, ascending.
 */
export interface HandInOverlap {
  blockId: string;
  mine: BlockJSON;
  theirs: BlockJSON;
  otherUserIds: string[];
}

/** The answer to POST /api/private/handin; a retried key answers the same again. */
export interface HandInResponse {
  /** The "Before hand-in" version: the room's script just before the hand-in. */
  versionId: string;
  /** The scenes the private copy changed since it was made, as `compareDocs(base, copy).scenes` counts them. */
  scenes: number;
  overlaps: HandInOverlap[];
  setAside: ReplaySetAside[];
}

/** The data of a `handed_in` CONTROL frame, as UTF-8 JSON. `at` is in milliseconds since the epoch. */
export interface HandedInControl {
  userId: string;
  versionId: string;
  at: number;
  scenes: number;
}

/**
 * A value of the owner's private index `private_copies` map, keyed by the room script's `docId`. Times are milliseconds
 * since the epoch; `handedInAt` is null while the copy is open.
 */
export interface PrivateCopyEntry {
  privateDocId: string;
  createdAt: number;
  handedInAt: number | null;
}
