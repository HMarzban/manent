// What a device's waiting edits rest on, and what they make of it: both read from a closed generation.
import {
  ALTERNATES_MAP,
  CUTS_MAP,
  CrdtUpdateError,
  ORIGIN_LOAD,
  ORIGIN_REPLAY,
  SCENE_PROGRESS_MAP,
  TITLE_PAGE_MAP,
  applyRemote,
  createDoc,
  deletionsOf,
  findTyped,
  loadDoc,
  observeScript,
  readStateVector,
  revisedOverrides,
  scriptBody,
  titlePage,
  updateMeta,
  withoutRemovedUnseen,
} from "@manent/crdt";
import type { CrdtDoc, SetAside, TypedText } from "@manent/crdt";
import { TITLE_PAGE_FIELDS, blockText, blocksOf } from "@manent/schema";
import type { DocJSON, TitlePageField } from "@manent/schema";
import type { DocFile } from "@manent/storage";
import { isDocKind } from "@manent/sync-protocol";
import type { DocKind } from "@manent/sync-protocol";
import { validatePush } from "../sync/validate.ts";
import { changedScriptMaps } from "./replay-maps.ts";
import type { ReplayMapChanges } from "./replay-maps.ts";

/** The verified rows of a generation after `seq`, by sequence. */
type Rows = ReadonlyMap<number, Uint8Array>;

/** What a person marked or cleared as revised while offline, the title page, and writers' material / scene progress. */
const SCRIPT_MAPS: readonly string[] = [
  "revisedOverrides",
  TITLE_PAGE_MAP,
  ALTERNATES_MAP,
  CUTS_MAP,
  SCENE_PROGRESS_MAP,
];

/** The root maps a replay may write, by document kind; a kind without a line writes a script's. */
const REPLAYED_MAPS: Readonly<Partial<Record<DocKind, readonly string[]>>> =
  Object.freeze({
    script: SCRIPT_MAPS,
  });

/** The maps a replay into the document may write, by the kind its log holds. */
function replayedMapsOf(file: DocFile, docId: string): readonly string[] {
  const kind = file.log.get(docId)?.kind;
  return (isDocKind(kind) ? REPLAYED_MAPS[kind] : undefined) ?? SCRIPT_MAPS;
}

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

/** What applyRemote sets aside when the deletions are applied to a copy of `doc`. */
function setAsideOn(
  doc: CrdtDoc,
  deletions: Uint8Array,
  own: ReadonlySet<number>,
): SetAside[] {
  const copy = loadDoc(doc.encodeState());
  try {
    return applyRemote(copy, deletions, own, ORIGIN_LOAD);
  } finally {
    copy.destroy();
  }
}

const isSame = (a: SetAside, b: SetAside): boolean =>
  a.blockId === b.blockId && a.text === b.text;

/**
 * Own text the later rows removed with a block their writer held without it: found on a copy of
 * mine, and on a copy of base where mine holds it in a block of that id, as when mine moved the
 * block and the rows removed the one base holds. A heal row is left out: its delete set also holds
 * what went with a deleted parent.
 */
function removedUnseen(
  docs: { base: CrdtDoc; mine: CrdtDoc; mineContent: DocJSON },
  later: readonly Uint8Array[],
  own: ReadonlySet<number>,
): SetAside[] {
  const deletions = deletionsOf(later);
  if (deletions === null) return [];
  const inMine = setAsideOn(docs.mine, deletions, own);
  const blocks = blocksOf(docs.mineContent);
  const isHeld = (item: SetAside): boolean =>
    blocks.some(
      (block) =>
        block.attrs.id === item.blockId && blockText(block).includes(item.text),
    );
  const inBase = setAsideOn(docs.base, deletions, own).filter(
    (item) => isHeld(item) && !inMine.some((found) => isSame(found, item)),
  );
  return [...inMine, ...inBase];
}

/**
 * Mine with the updates applied, and the text of `writers` they removed unseen; "invalid" when one
 * is not an update, writes a root map other than `maps`, or writes what a push may not.
 */
function applyWaiting(
  mine: CrdtDoc,
  updates: readonly Uint8Array[],
  replay: { writers: ReadonlySet<number>; maps: readonly string[] },
): SetAside[] | "invalid" {
  const { writers, maps } = replay;
  let refused = false;
  const stop = observeScript(mine, (report) => {
    if (report.origin !== ORIGIN_REPLAY) return;
    const otherMap = report.maps.some((name) => !maps.includes(name));
    if (otherMap || validatePush(report).length > 0) refused = true;
  });
  const setAside: SetAside[] = [];
  try {
    for (const update of updates)
      setAside.push(...applyRemote(mine, update, writers, ORIGIN_REPLAY));
  } catch (error) {
    if (!(error instanceof CrdtUpdateError)) throw error;
    return "invalid";
  } finally {
    stop();
  }
  return refused ? "invalid" : setAside;
}

/** For each client of the updates, the first clock base does not hold. */
function sinceOf(
  updates: readonly Uint8Array[],
  base: CrdtDoc,
): Map<number, number> {
  const held = readStateVector(base.encodeStateVector());
  const clients = updates.flatMap(updateMeta).map((meta) => meta.clientId);
  return new Map(clients.map((c) => [c, held.get(c) ?? 0]));
}

/** Base as the updates were made against it: without the text they removed unseen, with a parent they deleted. */
function seenContent(
  base: CrdtDoc,
  mine: CrdtDoc,
  updates: readonly Uint8Array[],
): DocJSON {
  const seen = withoutRemovedUnseen(base, mine, updates);
  try {
    return scriptBody(seen).materialize();
  } finally {
    seen.destroy();
  }
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

/** Mine's title page fields that differ from base's, in `TITLE_PAGE_FIELDS` order; "" empties one. */
function changedTitlePage(
  base: CrdtDoc,
  mine: CrdtDoc,
): [TitlePageField, string][] {
  const before = titlePage(base);
  const after = titlePage(mine);
  return TITLE_PAGE_FIELDS.flatMap((field): [TitlePageField, string][] => {
    const value = after.get(field);
    return value === before.get(field) ? [] : [[field, value]];
  });
}

/**
 * base: the generation at `lastServerSeq` (its newest checkpoint at or before it, then its rows),
 * moved on to the smallest later sequence at which the waiting updates are complete, without the
 * text that mine lacks and the updates never held (so that the merge keeps it where theirs holds
 * it); mine: base with the updates applied. setAside: anyone's text the updates removed unseen
 * (the replay would write those deletions afresh, so whoever typed it would never be told), then
 * own text the rows base moved on by removed from mine unseen; unseen: own text mine still holds
 * that the generation's later rows removed unseen. typed: by block, mine's text and which of its
 * characters the updates wrote. overrides: mine's revisedOverrides entries that differ from base's.
 * titlePage: mine's fields that differ from base's. maps: mine's alternates, cuts and sceneProgress
 * entries that differ from base's. invalid: an update is not one, writes a root map other than the
 * replayed maps, writes an invalid map entry, or leaves a block validation refuses; incomplete:
 * the updates still wait at the generation's last row, or a row they need does not verify.
 * RangeError for a generation that is not closed.
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
      unseen: SetAside[];
      typed: Map<string, TypedText>;
      overrides: [string, string | null][];
      titlePage: [TitlePageField, string][];
      maps: ReplayMapChanges;
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
    const writers = new Set(readStateVector(base.encodeStateVector()).keys());
    for (const clientId of ownClientIds) writers.add(clientId);
    const maps = replayedMapsOf(file, docId);
    const waiting = applyWaiting(mine, updates, { writers, maps });
    if (waiting === "invalid") return { ok: false, code: "invalid" };
    const own = ownClientIds;
    const later = catchUp(base, mine, rows, { seq: acked, finalSeq, own });
    if (later === "incomplete") return { ok: false, code: "incomplete" };
    const mapChanges = changedScriptMaps(base, mine);
    if (mapChanges === "invalid") return { ok: false, code: "invalid" };
    const rest = tail.rows
      .filter((row) => row.seq > acked && row.origin !== "heal")
      .map((row) => row.update);
    const mineContent = scriptBody(mine).materialize();
    return {
      ok: true,
      base: seenContent(base, mine, updates),
      mine: mineContent,
      setAside: [...waiting, ...later],
      unseen: removedUnseen({ base, mine, mineContent }, rest, own),
      typed: findTyped(mine, sinceOf(updates, base)),
      overrides: changedOverrides(base, mine),
      titlePage: changedTitlePage(base, mine),
      maps: mapChanges,
    };
  } finally {
    base.destroy();
    mine.destroy();
  }
}
