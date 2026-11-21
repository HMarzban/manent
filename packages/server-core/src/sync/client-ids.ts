// The Yjs client ids the server writes under: drawn from its ids, or the smallest a ledger leaves
// free.
import type { WriteMode } from "./ports.ts";

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a 32-bit of the UTF-16 code units: a Yjs client id, an unsigned 32-bit integer. */
export function clientIdOf(id: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < id.length; i++)
    hash = Math.imul(hash ^ id.charCodeAt(i), FNV_PRIME) >>> 0;
  return hash;
}

/** The smallest positive integer that is a key of none of `taken`. */
export function freeClientId(
  ...taken: readonly ReadonlyMap<number, unknown>[]
): number {
  let clientId = 1;
  while (taken.some((ids) => ids.has(clientId))) clientId++;
  return clientId;
}

/**
 * A client id that is a key of none of `taken`, for what the server itself writes into a room in
 * `mode`: the smallest free for the authority, and drawn from `ids` for a relayed room, whose
 * upstream gives out its own smallest first from a ledger this server never reads.
 */
export function writerClientId(
  mode: WriteMode,
  ids: () => string,
  taken: readonly ReadonlyMap<number, unknown>[],
): number {
  if (mode === "authority") return freeClientId(...taken);
  let clientId = clientIdOf(ids());
  while (taken.some((held) => held.has(clientId))) clientId = clientIdOf(ids());
  return clientId;
}
