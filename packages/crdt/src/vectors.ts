// State vectors read as numbers, and structs that wait for an update the document lacks.
import * as Y from "yjs";
import { yDocOf } from "./doc.ts";
import type { CrdtDoc } from "./doc.ts";
import { CrdtUpdateError } from "./updates.ts";
import type { StateVector } from "./updates.ts";

/** Client id → the next clock: the first of that client's changes the vector's holder lacks. Throws CrdtUpdateError on bytes that are not a state vector. */
export function readStateVector(vector: StateVector): Map<number, number> {
  try {
    return Y.decodeStateVector(vector);
  } catch (cause) {
    throw new CrdtUpdateError("the bytes are not a state vector", { cause });
  }
}

/** The bytes of a state vector holding these clocks: the inverse of readStateVector. */
export function writeStateVector(
  clocks: ReadonlyMap<number, number>,
): Uint8Array {
  return Y.encodeStateVector(new Map(clocks));
}

/** Drops the structs and the delete set that wait for something this document lacks; true when there were any. */
export function discardPending(doc: CrdtDoc): boolean {
  const { store } = yDocOf(doc);
  const pending = store.pendingStructs !== null || store.pendingDs !== null;
  store.pendingStructs = null;
  store.pendingDs = null;
  return pending;
}
