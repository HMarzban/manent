// Updates as bytes: refusing what is not a whole one, merging, and reading what one carries.
import * as Y from "yjs";

/** A Yjs v1 update. */
export type Update = Uint8Array;
export type StateVector = Uint8Array;

/** Bytes that are not a whole update. `cause` is what Yjs threw, when it threw. */
export class CrdtUpdateError extends Error {
  readonly code: "bad_update";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CrdtUpdateError";
    this.code = "bad_update";
  }
}

/**
 * Decodes the whole update before `fn` reads it, so that a cut-off update is
 * refused before anything is applied, and wraps whatever Yjs throws.
 */
export function withWholeUpdate<T>(update: Update, fn: () => T): T {
  try {
    Y.decodeUpdate(update);
    return fn();
  } catch (cause) {
    throw new CrdtUpdateError("the bytes are not a whole update", { cause });
  }
}

/** One update with the effect of all of them. */
export function mergeUpdates(updates: readonly Update[]): Update {
  return Y.mergeUpdates([...updates]);
}

/** The clock range, `fromClock` inclusive and `toClock` exclusive, that each client's changes in the update cover. Throws CrdtUpdateError. */
export function updateMeta(
  update: Update,
): { clientId: number; fromClock: number; toClock: number }[] {
  const { from, to } = withWholeUpdate(update, () => Y.parseUpdateMeta(update));
  return [...from].map(([clientId, fromClock]) => ({
    clientId,
    fromClock,
    toClock: to.get(clientId) ?? fromClock,
  }));
}
