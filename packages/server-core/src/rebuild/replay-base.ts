// What a device's waiting edits rest on, and what they make of it: both read from a closed generation.
import {
  CrdtUpdateError,
  ORIGIN_LOAD,
  ORIGIN_REPLAY,
  applyRemote,
  createDoc,
  deletionsOf,
  loadDoc,
  observeScript,
  revisedOverrides,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc, SetAside } from "@manent/crdt";
import type { DocJSON } from "@manent/schema";
import type { DocFile } from "@manent/storage";
import { validatePush } from "../sync/validate.ts";

/** The verified rows of a generation after `seq`, by sequence. */
type Rows = ReadonlyMap<number, Uint8Array>;

/** The one root map a replay may write: what a person marked or cleared as revised while offline. */
const REPLAYED_MAP = "revisedOverrides";

/** Applies the rows after `from` up to `to`; false when one of them does not verify. */
function applyRows(
  doc: CrdtDoc,
  rows: Rows,
  from: number,
  to: number,
): boolean {
  for (let seq = from + 1; seq <= to; seq++) {
    const update = rows.get(seq);
    if (update === undefined) return false;
    doc.applyUpdate(update, ORIGIN_LOAD);
  }
  return true;
}

/** Base and mine take the next row while mine waits for anything; "incomplete" past the last row. */
function catchUp(
  base: CrdtDoc,
  mine: CrdtDoc,
  rows: Rows,
  from: { seq: number; finalSeq: number; own: ReadonlySet<number> },
): SetAside[] | "incomplete" {
  const setAside: SetAside[] = [];
  for (let seq = from.seq + 1; mine.hasPendingStructs(); seq++) {
    const update = rows.get(seq);
    if (seq > from.finalSeq || update === undefined) return "incomplete";
    base.applyUpdate(update, ORIGIN_LOAD);
    setAside.push(...applyRemote(mine, update, from.own, ORIGIN_LOAD));
  }
  return setAside;
}

/**
 * Own text the later rows removed with a block their writer held without it, found on a copy of
 * mine. A heal row is left out: its delete set also holds what went with a deleted parent.
 */
function removedUnseen(
  mine: CrdtDoc,
  later: readonly Uint8Array[],
  own: ReadonlySet<number>,
): SetAside[] {
  const deletions = deletionsOf(later);
  if (deletions === null) return [];
  const copy = loadDoc(mine.encodeState());
  try {
    return applyRemote(copy, deletions, own, ORIGIN_LOAD);
  } finally {
    copy.destroy();
  }
}

/** Mine with the updates applied, and the set-aside text; "invalid" when one is not an update, writes another root map, or writes what a push may not. */
function applyWaiting(
  mine: CrdtDoc,
  updates: readonly Uint8Array[],
  own: ReadonlySet<number>,
): SetAside[] | "invalid" {
  let refused = false;
  const stop = observeScript(mine, (report) => {
    if (report.origin !== ORIGIN_REPLAY) return;
    const otherMap = report.maps.some((name) => name !== REPLAYED_MAP);
    if (otherMap || validatePush(report).length > 0) refused = true;
  });
  const setAside: SetAside[] = [];
  try {
    for (const update of updates)
      setAside.push(...applyRemote(mine, update, own, ORIGIN_REPLAY));
  } catch (error) {
    if (!(error instanceof CrdtUpdateError)) throw error;
    return "invalid";
  } finally {
    stop();
  }
  return refused ? "invalid" : setAside;
}

/** Mine's overrides that differ from base's, keys ascending; a null value removes the key. */
function changedOverrides(
  base: CrdtDoc,
  mine: CrdtDoc,
): [string, string | null][] {
  const before = new Map(revisedOverrides(base).entries());
  const after = new Map(revisedOverrides(mine).entries());
  return [...new Set([...before.keys(), ...after.keys()])]
    .toSorted()
    .flatMap((key): [string, string | null][] => {
      const value = after.get(key) ?? null;
      return value === (before.get(key) ?? null) ? [] : [[key, value]];
    });
}

/**
 * base: the generation at `lastServerSeq` (its newest checkpoint at or before it, then its rows),
 * moved on to the smallest later sequence at which the waiting updates are complete; mine: base with
 * the updates applied. setAside: own text the updates or any of the generation's later rows removed
 * unseen. overrides: mine's revisedOverrides entries that differ from base's. invalid: an update is
 * not one, writes a root map other than revisedOverrides, or leaves a block validation refuses;
 * incomplete: the updates still wait at the generation's last row, or a row they need does not
 * verify. RangeError for a generation that is not closed.
 */
export function replayBase(
  file: DocFile,
  docId: string,
  generation: number,
  lastServerSeq: number,
  updates: readonly Uint8Array[],
  ownClientIds: ReadonlySet<number>,
):
  | {
      ok: true;
      base: DocJSON;
      mine: DocJSON;
      setAside: SetAside[];
      overrides: [string, string | null][];
    }
  | { ok: false; code: "incomplete" | "invalid" } {
  const frozen = file.generations.get(docId, generation);
  if (frozen === null)
    throw new RangeError(`generation ${generation} of ${docId} is not closed`);
  const { finalSeq } = frozen;
  const acked = Math.min(lastServerSeq, finalSeq);
  const checkpoint = file.checkpoints.atOrBefore(docId, generation, acked);
  const from = checkpoint?.seq ?? 0;
  const tail = file.log.tail(docId, generation, from, { quarantine: false });
  const rows: Rows = new Map(tail.rows.map((row) => [row.seq, row.update]));
  const base = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  const mine = createDoc();
  try {
    if (!applyRows(base, rows, from, acked))
      return { ok: false, code: "incomplete" };
    mine.applyUpdate(base.encodeState(), ORIGIN_LOAD);
    const waiting = applyWaiting(mine, updates, ownClientIds);
    if (waiting === "invalid") return { ok: false, code: "invalid" };
    const own = ownClientIds;
    const later = catchUp(base, mine, rows, { seq: acked, finalSeq, own });
    if (later === "incomplete") return { ok: false, code: "incomplete" };
    const unseen = tail.rows
      .filter((row) => row.seq > acked && row.origin !== "heal")
      .map((row) => row.update);
    return {
      ok: true,
      base: scriptBody(base).materialize(),
      mine: scriptBody(mine).materialize(),
      setAside: [...waiting, ...later, ...removedUnseen(mine, unseen, own)],
      overrides: changedOverrides(base, mine),
    };
  } finally {
    base.destroy();
    mine.destroy();
  }
}
