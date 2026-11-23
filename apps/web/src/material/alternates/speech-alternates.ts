// A script's alternates by speech, read from the JSON of its alternates map.
import { isAlternate } from "@manent/crdt";
import type { Alternate } from "@manent/crdt";

/** An alternate with the id it is kept under. */
export interface KeptAlternate extends Alternate {
  id: string;
}

const byAge = (a: KeptAlternate, b: KeptAlternate): number =>
  a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The alternates of each speech among `entries`, by the dialogue block's id, oldest first, then by id; an entry of
 * another shape is left out.
 */
export function alternatesBySpeech(
  entries: Readonly<Record<string, unknown>>,
): ReadonlyMap<string, readonly KeptAlternate[]> {
  const bySpeech = new Map<string, KeptAlternate[]>();
  for (const [id, value] of Object.entries(entries)) {
    if (!isAlternate(value)) continue;
    const kept = bySpeech.get(value.blockId) ?? [];
    kept.push({ ...value, id });
    bySpeech.set(value.blockId, kept);
  }
  return new Map(
    [...bySpeech].map(([blockId, kept]) => [blockId, kept.toSorted(byAge)]),
  );
}
