// Awareness updates as bytes, in y-protocols' layout: a count, then per client its id, clock and JSON state.
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { CrdtUpdateError } from "./updates.ts";

/** One client's awareness. `clock` rises with every change of `state`; a null state means the client is gone. */
export interface AwarenessEntry {
  clientId: number;
  clock: number;
  state: Record<string, unknown> | null;
}

function isState(value: unknown): value is Record<string, unknown> | null {
  return value === null || (typeof value === "object" && !Array.isArray(value));
}

function readEntry(decoder: decoding.Decoder): AwarenessEntry {
  const clientId = decoding.readVarUint(decoder);
  const clock = decoding.readVarUint(decoder);
  const state: unknown = JSON.parse(decoding.readVarString(decoder));
  if (!isState(state))
    throw new TypeError(
      `an awareness state must be an object or null, not ${JSON.stringify(state)}`,
    );
  return { clientId, clock, state };
}

/** Throws CrdtUpdateError on bytes that are not one whole awareness update. */
export function decodeAwareness(update: Uint8Array): AwarenessEntry[] {
  try {
    const decoder = decoding.createDecoder(update);
    const entries: AwarenessEntry[] = [];
    for (let count = decoding.readVarUint(decoder); count > 0; count--)
      entries.push(readEntry(decoder));
    if (decoding.hasContent(decoder))
      throw new RangeError(
        `${update.length - decoder.pos} bytes follow the last entry`,
      );
    return entries;
  } catch (cause) {
    throw new CrdtUpdateError("the bytes are not an awareness update", {
      cause,
    });
  }
}

function isUnsigned(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Byte for byte what y-protocols 1.0.7 writes for the same entries. Throws a RangeError for an id or clock that is not an unsigned integer. */
export function encodeAwareness(
  entries: readonly AwarenessEntry[],
): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, entries.length);
  for (const { clientId, clock, state } of entries) {
    if (!isUnsigned(clientId) || !isUnsigned(clock))
      throw new RangeError(
        `an awareness client id and clock must be unsigned integers, not ${clientId} and ${clock}`,
      );
    encoding.writeVarUint(encoder, clientId);
    encoding.writeVarUint(encoder, clock);
    encoding.writeVarString(encoder, JSON.stringify(state));
  }
  return encoding.toUint8Array(encoder);
}
