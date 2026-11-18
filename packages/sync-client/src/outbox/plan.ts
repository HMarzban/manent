// The outbox as it goes out: own updates cut into batches under the limits, each setting alone.
import { mergeUpdates } from "@manent/crdt";
import { BATCH_BYTES, BATCH_ENTRIES } from "../ports/defaults.ts";
import type { StoredEntry, StoredUpdate } from "../ports/ports.ts";

/** `clientSeq`: the `localSeq` of the last entry the item carries. `entries`: how many it carries. */
export type OutboxItem =
  | { kind: "push"; clientSeq: number; update: Uint8Array; entries: number }
  | { kind: "set"; clientSeq: number; key: string; value: string };

/** An entry the server has not acknowledged and this device must send: an own update or a setting. */
function isWaiting(entry: StoredEntry): boolean {
  return !entry.acked && (entry.kind === "set" || entry.own);
}

/**
 * The waiting entries of `entries` (in `localSeq` order) as items, in the same
 * order. Consecutive updates between settings are cut into runs of at most
 * `bytes` update bytes (BATCH_BYTES by default) and `entries` entries
 * (BATCH_ENTRIES); a larger update is a run of its own. A run is the merge of
 * its updates, never a diff of the document, so text typed and deleted still
 * travels; a setting is always an item of its own.
 */
export function planOutbox(
  entries: readonly StoredEntry[],
  limits?: { bytes?: number; entries?: number },
): OutboxItem[] {
  const maxBytes = limits?.bytes ?? BATCH_BYTES;
  const maxEntries = limits?.entries ?? BATCH_ENTRIES;
  const items: OutboxItem[] = [];
  let run: StoredUpdate[] = [];
  let runBytes = 0;
  const close = (): void => {
    if (run.length > 0) items.push(pushOf(run));
    run = [];
    runBytes = 0;
  };
  for (const entry of entries) {
    if (!isWaiting(entry)) continue;
    if (entry.kind === "set") {
      close();
      items.push({
        kind: "set",
        clientSeq: entry.localSeq,
        key: entry.key,
        value: entry.value,
      });
      continue;
    }
    const bytes = entry.update.byteLength;
    if (runBytes + bytes > maxBytes || run.length === maxEntries) close();
    run.push(entry);
    runBytes += bytes;
  }
  close();
  return items;
}

// one update is passed through as it is: mergeUpdates returns it unchanged
function pushOf(run: readonly StoredUpdate[]): OutboxItem {
  const last = run.at(-1);
  if (last === undefined)
    throw new RangeError("a push carries at least one entry");
  return {
    kind: "push",
    clientSeq: last.localSeq,
    update: mergeUpdates(run.map((e) => e.update)),
    entries: run.length,
  };
}

/** Distinct element IDs over the waiting own updates, plus one per waiting setting. */
export function waitingCount(entries: readonly StoredEntry[]): number {
  const elements = new Set<string>();
  let settings = 0;
  for (const entry of entries) {
    if (!isWaiting(entry)) continue;
    if (entry.kind === "set") settings += 1;
    else for (const id of entry.elements) elements.add(id);
  }
  return elements.size + settings;
}
