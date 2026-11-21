// A locked Final Draft file's production: its page starts, scene numbers, revision sets and their marks.
import { DEFAULT_MARK } from "@manent/revisions";
import type { NumberingScheme, RevisionColour } from "@manent/revisions";
import type { ImportedProduction, ImportedSet } from "../script/model.ts";
import type { XmlNode } from "../xml/node.ts";
import { nearestPaper, parseFdxColour } from "./colours.ts";
import { attr, elementsOf } from "./kept.ts";
import { blockAtOffset } from "./offsets.ts";
import type { RevisionRun } from "./runs.ts";

const COUNT = /^\d+$/;

/** A `Revision` of the file's `Revisions` list, by its `ID`. */
export interface RevisionSet {
  readonly id: string;
  readonly sourceName: string;
  readonly colour: RevisionColour;
  readonly mark: string;
  readonly fullDraft: boolean;
}

/** What the reader has found of a file's production once its `Content` is read. */
export interface ProductionReading {
  /** The blocks that count in script offsets, in order: every block but an inserted page break. */
  readonly counted: readonly { id: string; text: string }[];
  readonly starts: Int32Array;
  readonly sets: readonly RevisionSet[];
  readonly runs: readonly (RevisionRun & { readonly blockId: string })[];
  readonly sceneNumbers: readonly { blockId: string; num: string }[];
  /** The `LockedPage` and `DeletedTextLocation` elements, in the file's order. */
  readonly lockedPages: readonly XmlNode[];
  readonly deletions: readonly XmlNode[];
  /** `SceneNumberOptions@NumberScheme`, null when absent. */
  readonly numberScheme: string | null;
}

/** The sets the file defines, in its order; a set's colour is its page colour's nearest paper, else its colour's. */
export function readRevisionSets(revisions: XmlNode | null): RevisionSet[] {
  if (revisions === null) return [];
  return elementsOf(revisions).flatMap((revision) => {
    const id = attr(revision, "ID");
    if (revision.name !== "Revision" || id === null) return [];
    const rgb =
      parseFdxColour(attr(revision, "PageColor") ?? "") ??
      parseFdxColour(attr(revision, "Color") ?? "");
    return [
      {
        id,
        sourceName: attr(revision, "Name") ?? "",
        colour: rgb === null ? "white" : nearestPaper(rgb),
        mark: attr(revision, "Mark") ?? DEFAULT_MARK,
        fullDraft: attr(revision, "FullRevision") === "Yes",
      },
    ];
  });
}

function countOf(value: string | null): number | null {
  return value !== null && COUNT.test(value) ? Number(value) : null;
}

/** The block, and the offset in its text, of a script offset; null past the block's text or the script's end. */
function place(
  reading: ProductionReading,
  offset: number | null,
): { blockId: string; offset: number } | null {
  const at = offset === null ? null : blockAtOffset(reading.starts, offset);
  const block = at === null ? undefined : reading.counted[at.block];
  if (at === null || block === undefined || at.offset > block.text.length)
    return null;
  return { blockId: block.id, offset: at.offset };
}

function readAnchors(reading: ProductionReading): {
  anchors: ImportedProduction["anchors"];
  unplaced: XmlNode[];
} {
  const pages = reading.lockedPages
    .map((page) => ({ page, position: countOf(attr(page, "Position")) }))
    .toSorted((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
  const anchors: { label: string; blockId: string; offset: number }[] = [];
  const unplaced: XmlNode[] = [];
  for (const { page, position } of pages) {
    const label = attr(page, "PageNumber");
    const at = place(reading, position);
    if (label === null || label === "" || at === null) unplaced.push(page);
    else anchors.push({ label, ...at });
  }
  const first = reading.counted[0];
  const head = anchors[0];
  if (
    first !== undefined &&
    head !== undefined &&
    (head.blockId !== first.id || head.offset !== 0)
  )
    anchors.unshift({ label: "1", blockId: first.id, offset: 0 });
  return { anchors, unplaced };
}

function setBlocks(
  reading: ProductionReading,
  set: RevisionSet,
): ImportedSet["blocks"] {
  const marked = new Map<
    string,
    { inserted: [number, number][]; deletedAt: number[] }
  >();
  const entry = (blockId: string) => {
    const found = marked.get(blockId) ?? { inserted: [], deletedAt: [] };
    marked.set(blockId, found);
    return found;
  };
  for (const run of reading.runs) {
    if (run.revisionId !== set.id) continue;
    const { inserted } = entry(run.blockId);
    const last = inserted.at(-1);
    if (last !== undefined && last[1] === run.start) last[1] = run.end;
    else inserted.push([run.start, run.end]);
  }
  for (const deletion of reading.deletions) {
    if (attr(deletion, "RevisionID") !== set.id) continue;
    const at = place(reading, countOf(attr(deletion, "Offset")));
    if (at !== null) entry(at.blockId).deletedAt.push(at.offset);
  }
  return reading.counted.flatMap(({ id }) => {
    const found = marked.get(id);
    return found === undefined
      ? []
      : [
          {
            blockId: id,
            inserted: found.inserted,
            deletedAt: found.deletedAt.toSorted((a, b) => a - b),
          },
        ];
  });
}

/**
 * The file's production, and the `LockedPage` entries that cannot be placed. Null when the file has no
 * `LockedPage` entry and no set marks a run or a deletion; a set that marks nothing is left out. A deletion
 * whose offset cannot be placed, or whose set the file does not define, is not read.
 */
export function readProduction(reading: ProductionReading): {
  production: ImportedProduction | null;
  unplaced: XmlNode[];
} {
  const { anchors, unplaced } = readAnchors(reading);
  const sets = reading.sets.flatMap((set) => {
    const blocks = setBlocks(reading, set);
    if (blocks.length === 0) return [];
    const { sourceName, colour, mark, fullDraft } = set;
    return [{ sourceName, colour, mark, fullDraft, blocks }];
  });
  const numbering: NumberingScheme =
    reading.numberScheme === "A1" ? "prefix" : "suffix";
  return {
    production:
      reading.lockedPages.length > 0 || sets.length > 0
        ? { anchors, sceneNumbers: reading.sceneNumbers, numbering, sets }
        : null,
    unplaced,
  };
}
