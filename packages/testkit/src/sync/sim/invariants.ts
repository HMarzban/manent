// The invariants a settled world keeps, judged against the log and the devices' own stores, and
// when a device that is not synced is rightly held back.
import { ORIGIN_LOAD, createDoc, loadDoc } from "@manent/crdt";
import type { SideState } from "@manent/sync-client";
import type { MemoryStorage } from "@manent/storage/testing";
import { gateDocument } from "@manent/sync-protocol";
import { DOC, linesOf } from "./device.ts";
import type { Books, Device } from "./device.ts";
import { HOME } from "./script.ts";

/** The script as the log alone rebuilds it. */
interface Rebuilt {
  lines: string[];
  pending: boolean;
  /** Sequences the log holds, verified or not. */
  seqs: Set<number>;
  head: number;
  /** Rows above it may be missing: the script is healing past it. */
  healingFrom: number | null;
}

export function rebuild(storage: MemoryStorage): Rebuilt {
  const { log } = storage.open(HOME);
  const { rows, corrupt } = log.tail(DOC, 1, 0, { quarantine: false });
  const doc = createDoc();
  for (const { update } of rows) doc.applyUpdate(update, ORIGIN_LOAD);
  const rebuilt = {
    lines: linesOf(doc),
    pending: doc.hasPendingStructs(),
    seqs: new Set([...rows.map((row) => row.seq), ...corrupt]),
    head: log.get(DOC)?.headSeq ?? 0,
    healingFrom: log.healing(DOC)?.verifiedSeq ?? null,
  };
  doc.destroy();
  return rebuilt;
}

const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, i) => line === b[i]);

type HeldBack = "access_removed" | "deleted" | "read_only";

/** A side state that holds a device back, and when the server's records make it the right one. */
const HELD_BACK: Readonly<
  Record<HeldBack, (storage: MemoryStorage, device: Device) => boolean>
> = Object.freeze({
  access_removed: (storage, device) =>
    storage.directory.roleOf(DOC, device.userId) === null,
  deleted: (storage) => storage.directory.tombstoneOf(DOC) !== null,
  read_only(storage, device) {
    const row = storage.open(HOME).log.get(DOC);
    if (row === null) return false;
    const { schemaVersion, engineVersion } = row;
    const doc = {
      minSchemaVersion: schemaVersion,
      engineVersion: engineVersion ?? 0,
    };
    return gateDocument(device.versions, doc) === "read_only";
  },
});

const isHeldBack = (side: SideState): side is HeldBack =>
  Object.hasOwn(HELD_BACK, side);

/** Offline by choice, synced, or held back for a reason the server's records give. */
export function isSettled(storage: MemoryStorage, device: Device): boolean {
  const status = device.handle.status.get();
  if (!device.wanted || status.synced) return true;
  return status.side.some(
    (side) => isHeldBack(side) && HELD_BACK[side](storage, device),
  );
}

/** I4 for one device: saved means its store holds the script, synced that nothing waits. */
export async function storeFault(device: Device): Promise<string | null> {
  const status = device.handle.status.get();
  if (!status.saved) return null;
  const loaded = await device.store.load(DOC);
  const name = device.device;
  if (loaded === null) return `I4: ${name} says saved and stores no script`;
  const { checkpoint, entries } = loaded;
  const stored = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  for (const entry of entries)
    if (entry.kind === "update") stored.applyUpdate(entry.update, ORIGIN_LOAD);
  const same = sameLines(linesOf(stored), device.lines());
  stored.destroy();
  if (!same) return `I4: ${name} says saved with a write unsettled`;
  const waiting = entries.some((e) => !e.acked && (e.kind === "set" || e.own));
  if (status.synced && waiting)
    return `I4: ${name} says synced with an entry unacknowledged`;
  return null;
}

/**
 * Kept by a device that held it: in its Recovered text (with `cause`, only for
 * that cause), or still in its document while it has not synced, to be set
 * aside when it does.
 */
function isKept(books: Books, marker: string, cause: "merge" | null): boolean {
  return [...(books.holders.get(marker) ?? [])].some(
    (device) =>
      (!device.handle.status.get().synced &&
        device.lines().some((line) => line.includes(marker))) ||
      device.handle.recovered
        .get()
        .some(
          (item) =>
            (cause === null || item.cause === cause) &&
            item.text.includes(marker),
        ),
  );
}

/** The first invariant broken, named; null when all hold. `storeFault` is I4, found at the last settle. */
export function firstBroken(world: {
  storage: MemoryStorage;
  devices: readonly Device[];
  books: Books;
  restored: boolean;
  storeFault: string | null;
}): string | null {
  const { books, devices } = world;
  const log = rebuild(world.storage);
  const text = log.lines.join("\n");
  const gone = (marker: string): boolean =>
    !text.includes(marker) && !books.removed.has(marker);
  const lost = world.restored ? null : "merge";
  for (const marker of books.acked)
    if (gone(marker) && !isKept(books, marker, lost))
      return `I1: ${marker} was acknowledged and is not in the log`;
  for (const device of devices)
    if (
      device.handle.status.get().synced &&
      !sameLines(device.lines(), log.lines)
    )
      return `I2: ${device.device} is synced and holds other text than the log`;
  for (const [marker, typist] of books.typist)
    if (gone(marker) && !isKept(books, marker, null))
      return `I3: ${marker}, typed by ${typist.device}, is nowhere`;
  if (world.storeFault !== null) return world.storeFault;
  for (let seq = 1; seq <= log.head; seq++)
    if (
      !log.seqs.has(seq) &&
      (log.healingFrom === null || seq <= log.healingFrom)
    )
      return `I5: the log has no row ${seq} of ${log.head}`;
  if (log.pending)
    return "I5: the script rebuilt from the log has pending structs";
  return null;
}
