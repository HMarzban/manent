// A locked Final Draft file's production: its page starts, scene numbers, revision sets and their marks.
import type { LockAnchorRecord } from "@manent/pagination";
import {
  COLOUR_NAMES,
  COLOUR_ORDERS,
  DEFAULT_MARK,
  FALLBACK_IDS,
  QUOTE_UNITS,
  paperRgb,
  revisionColour,
  revisionName,
} from "@manent/revisions";
import type {
  BlockMark,
  NumberingScheme,
  RevisionColour,
  RevisionSource,
} from "@manent/revisions";
import type {
  ExportProduction,
  ImportedProduction,
  ImportedScript,
  ImportedSet,
  ScriptForExport,
} from "../script/model.ts";
import type { ImportRecord } from "../script/record.ts";
import type { XmlNode } from "../xml/node.ts";
import { fdxColour, nearestPaper, parseFdxColour } from "./colours.ts";
import { attr, elementsOf } from "./kept.ts";
import { blockAtOffset } from "./offsets.ts";
import { blockTextOf } from "./runs.ts";
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

const isHighSurrogate = (unit: number): boolean =>
  unit >= 0xd800 && unit <= 0xdbff;

function quoteAt(text: string, offset: number): string {
  let end = Math.min(text.length, offset + QUOTE_UNITS);
  if (end < text.length && isHighSurrogate(text.charCodeAt(end - 1))) end--;
  return text.slice(offset, end);
}

/** Lock records for the file's page starts, as the authority makes them at import: level 1, source "import". */
function importedAnchors(
  script: ImportedScript,
  starts: ImportedProduction["anchors"],
): LockAnchorRecord[] {
  const ids = script.blocks.map((block) => block.attrs?.id ?? "");
  return starts.map((start, i) => {
    const at = ids.indexOf(start.blockId);
    const next = starts[i + 1];
    const nextAt = next === undefined ? ids.length : ids.indexOf(next.blockId);
    const end =
      nextAt < 0
        ? ids.length
        : nextAt + (next !== undefined && next.offset > 0 ? 1 : 0);
    const block = script.blocks[at];
    return {
      level: 1,
      order: i + 1,
      label: start.label,
      blockId: start.blockId,
      offset: start.offset,
      quote: quoteAt(blockTextOf(block), start.offset),
      fallbackIds: ids.slice(at + 1, Math.min(end, at + 1 + FALLBACK_IDS)),
      source: "import",
    };
  });
}

/**
 * The production of an import as the export sees it right after the authority locked it: its page starts as
 * import anchors, its numbers, White with no marks, one source per set with its marks, then an empty active
 * set. `day` is the import's, from the record; "" without one.
 */
export function importedForExport(
  script: ImportedScript,
  title: string,
  record: ImportRecord | null,
): ScriptForExport {
  const p = script.production;
  const day =
    record === null
      ? ""
      : new Date(record.importedAt).toISOString().slice(0, 10);
  const order = COLOUR_ORDERS.standard;
  const turn = (ordinal: number): RevisionSource => ({
    ordinal,
    name: revisionName(order, ordinal),
    colour: revisionColour(order, ordinal),
    mark: DEFAULT_MARK,
    day,
    fullDraft: false,
    marks: new Map(),
  });
  return {
    title,
    format: "screenplay",
    blocks: script.blocks,
    notes: script.notes,
    record,
    production:
      p === null
        ? null
        : {
            anchors: importedAnchors(script, p.anchors),
            numbers: new Map(p.sceneNumbers.map((n) => [n.blockId, n.num])),
            numbering: p.numbering,
            sources: [
              turn(0),
              ...p.sets.map((set, i): RevisionSource => ({
                ordinal: i + 1,
                name: COLOUR_NAMES[set.colour],
                colour: set.colour,
                mark: set.mark,
                day,
                fullDraft: set.fullDraft,
                marks: new Map(
                  set.blocks.map((b): [string, BlockMark] => [
                    b.blockId,
                    {
                      kind: "ranges",
                      inserted: b.inserted,
                      deletedAt: b.deletedAt,
                    },
                  ]),
                ),
              })),
              turn(p.sets.length + 1),
            ],
          },
  };
}

/** Where a block and an offset in its text sit among the script's offsets; null for a block not written. */
export type ScriptOffsetOf = (blockId: string, offset: number) => number | null;

function writeLockedPages(
  production: ExportProduction,
  offsetOf: ScriptOffsetOf,
  unplaced: readonly XmlNode[],
): XmlNode {
  const pages = production.anchors.flatMap((anchor) => {
    if (anchor.level !== 1) return [];
    const position =
      offsetOf(anchor.blockId, anchor.offset) ??
      anchor.fallbackIds.map((id) => offsetOf(id, 0)).find((at) => at !== null);
    if (position === undefined || position === null) return [];
    return [
      {
        name: "LockedPage",
        attributes: {
          LevelIndex: "1",
          LockLevel: "0",
          PageNumber: anchor.label,
          Position: String(position),
        },
        children: [],
      },
    ];
  });
  return {
    name: "LockedPages",
    attributes: {},
    children: [...pages, ...unplaced],
  };
}

/**
 * The production's `LockedPages`, `Revisions` and, when anything was deleted, `DeletedText`. A source with
 * marks is written as a `Revision` of its ordinal, named `names[ordinal - 1]` (the set's name in the file it
 * came from), else "<its name> Rev."; `settings` are the kept attributes of the file's `Revisions`.
 */
export function writeProduction(
  production: ExportProduction,
  offsetOf: ScriptOffsetOf,
  options: {
    names: readonly string[];
    settings: Readonly<Record<string, string>>;
    unplaced: readonly XmlNode[];
  },
): XmlNode[] {
  const marking = production.sources.filter((source) => source.marks.size > 0);
  const revisions: XmlNode = {
    name: "Revisions",
    attributes: {
      ...options.settings,
      ActiveSet: String(production.sources.at(-1)?.ordinal ?? 0),
    },
    children: marking.map((source) => ({
      name: "Revision",
      attributes: {
        ID: String(source.ordinal),
        Name: options.names[source.ordinal - 1] ?? `${source.name} Rev.`,
        PageColor: fdxColour(paperRgb(source.colour)),
        Mark: source.mark,
        FullRevision: source.fullDraft ? "Yes" : "No",
        Style: "",
      },
      children: [],
    })),
  };
  const deletions = marking
    .flatMap((source) =>
      [...source.marks].flatMap(([blockId, mark]) =>
        (mark.kind === "ranges" ? mark.deletedAt : []).flatMap((at) => {
          const offset = offsetOf(blockId, at);
          return offset === null ? [] : [{ offset, ordinal: source.ordinal }];
        }),
      ),
    )
    .toSorted((a, b) => a.offset - b.offset || a.ordinal - b.ordinal);
  const deleted: XmlNode = {
    name: "DeletedText",
    attributes: {},
    children: deletions.map(({ offset, ordinal }) => ({
      name: "DeletedTextLocation",
      attributes: { Offset: String(offset), RevisionID: String(ordinal) },
      children: [],
    })),
  };
  return [
    writeLockedPages(production, offsetOf, options.unplaced),
    revisions,
    ...(deletions.length === 0 ? [] : [deleted]),
  ];
}
