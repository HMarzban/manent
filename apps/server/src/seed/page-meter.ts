// The page meter the seed fits its text with: the pagination engine over a document's blocks; and
// a script's pages, numbers and marks as the server holds them, which a written passage is checked against.
import {
  ORIGIN_LOAD,
  createDoc,
  loadDoc,
  scriptBody,
  scriptSettings,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { SeedBlock, SeedPassage } from "@manent/demo";
import {
  ENGINE_VERSION,
  NO_LOCKS,
  engineFor,
  profileFromSettings,
  readLayoutSettings,
  toLockTable,
} from "@manent/pagination";
import type {
  Engine,
  LayoutBlock,
  LockAnchorRecord,
  Pagination,
} from "@manent/pagination";
import type { BlockMark } from "@manent/revisions";
import { blocksOf } from "@manent/schema";
import type {
  BlockJSON,
  DocJSON,
  FlatBlock,
  FormatId,
  TextJSON,
} from "@manent/schema";
import {
  activeSet,
  isLocked,
  marksSince,
  overridesOf,
  scriptAt,
  versionContent,
} from "@manent/server-core";
import type { DocFile, Storage } from "@manent/storage";
import type { ProductionState } from "@manent/sync-protocol";

// The demo's PageMeter port and its SeedLayout, field for field: its entry does not export them.
export interface SeedLayout {
  format: FormatId;
  settings: Readonly<Record<string, unknown>>;
  anchors: ProductionState["anchors"] | null;
}
export interface PageMeter {
  pages(
    blocks: readonly SeedBlock[],
    layout: SeedLayout,
  ): Promise<readonly { label: string; blockIndex: number }[]>;
}

/** The engine this build lays pages out with. */
function buildEngine(): Engine {
  const engine = engineFor(ENGINE_VERSION);
  if (engine === null)
    throw new RangeError(`this build carries no engine ${ENGINE_VERSION}`);
  return engine;
}

/** Each page's label and its first block: a block split across a break counts on the page it starts. */
function pageStarts(p: Pagination): { label: string; blockIndex: number }[] {
  return p.pages.map((page) => ({
    label: page.label,
    blockIndex: page.line > 0 ? page.block + 1 : page.block,
  }));
}

/** The text runs of `block`, each with the marks that cover it. */
function runsOf(block: SeedBlock): TextJSON[] {
  const cuts = new Set([0, block.text.length]);
  for (const { from, to } of block.marks) cuts.add(from).add(to);
  const sorted = [...cuts].toSorted((a, b) => a - b);
  return sorted.slice(1).flatMap((to, i) => {
    const from = sorted[i]!;
    const text = block.text.slice(from, to);
    if (text === "") return [];
    const marks = block.marks
      .filter((m) => m.from <= from && m.to >= to)
      .map((m) => ({ type: m.mark }));
    return [
      marks.length === 0
        ? { type: "text", text }
        : { type: "text", text, marks },
    ];
  });
}

/** A block id for the block at `index`, the same for every measure. */
const meterId = (index: number): string =>
  `m${index.toString(36).padStart(15, "0")}`;

function toBlockJSON(block: SeedBlock, index: number): BlockJSON {
  const attrs = {
    id: meterId(index),
    type: block.element,
    ...(block.kind === null ? {} : { kind: block.kind }),
  };
  const content = runsOf(block);
  return content.length === 0
    ? { type: "block", attrs }
    : { type: "block", attrs, content };
}

/**
 * The anchors on the measured blocks, which carry ids of their own: each is placed on the first
 * block, from the previous anchor's on, whose text holds the anchor's quote at its offset. An
 * anchor whose quote no block holds is left out, as the engine leaves out one it cannot place.
 */
function placedAnchors(
  records: readonly LockAnchorRecord[],
  blocks: readonly LayoutBlock[],
): LockAnchorRecord[] {
  let from = 0;
  return records
    .toSorted((a, b) => a.order - b.order || a.level - b.level)
    .flatMap((record) => {
      const at = blocks.findIndex(
        (block, i) =>
          i >= from && block.text.startsWith(record.quote, record.offset),
      );
      if (at < 0) return [];
      from = at;
      return [{ ...record, blockId: blocks[at]!.id, fallbackIds: [] }];
    });
}

/**
 * Pages as the engine of this build lays out `blocks` in `layout`: its format and settings, and,
 * for a locked script, its anchors and its scene numbers shown. A format without pages has none.
 */
export function createPageMeter(): PageMeter {
  const engine = buildEngine();
  return {
    async pages(blocks, layout) {
      const settings = readLayoutSettings((key) =>
        key === "script.format" ? layout.format : layout.settings[key],
      );
      const locked = layout.anchors !== null;
      const profile = profileFromSettings(engine, {
        ...settings,
        scenesNumbered: locked,
      });
      if (profile === null) return [];
      const flat = blocksOf({
        type: "doc",
        content: [{ type: "section", content: blocks.map(toBlockJSON) }],
      });
      const laid = engine.toLayoutBlocks(flat);
      const locks = toLockTable(placedAnchors(layout.anchors ?? [], laid));
      return pageStarts(engine.paginate(laid, profile, locks));
    },
  };
}

/** The document as its log holds it, from its newest checkpoint and the rows after it. */
function readLogged(file: DocFile, docId: string): CrdtDoc {
  const row = file.log.get(docId);
  if (row === null) throw new RangeError(`${docId} has no log`);
  const checkpoint = file.checkpoints.newest(docId, row.generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  const from = checkpoint?.seq ?? 0;
  const { rows } = file.log.tail(docId, row.generation, from, {
    quarantine: false,
  });
  for (const { update } of rows) doc.applyUpdate(update, ORIGIN_LOAD);
  return doc;
}

/** A script as the server lays it out: in production, under its anchors, with its derived numbers and the active revision's marks. */
export interface ServerScript {
  readonly content: DocJSON;
  readonly flat: readonly FlatBlock[];
  /** Null for a format without pages. */
  readonly pagination: Pagination | null;
  /** By heading id, the numbers production derives for headings without one; empty while not locked. */
  readonly numbers: ReadonlyMap<string, string>;
  /** By block id; empty while not locked. */
  readonly marks: ReadonlyMap<string, BlockMark>;
}

function scriptOf(doc: CrdtDoc, file: DocFile, docId: string): ServerScript {
  const engine = buildEngine();
  if (!isLocked(file, docId)) {
    const settings = scriptSettings(doc).entries();
    const profile = profileFromSettings(
      engine,
      readLayoutSettings((key) => settings[key]),
    );
    const content = scriptBody(doc).materialize();
    const flat = blocksOf(content);
    const laid = engine.toLayoutBlocks(flat);
    const pagination =
      profile === null ? null : engine.paginate(laid, profile, NO_LOCKS);
    return { content, flat, pagination, numbers: new Map(), marks: new Map() };
  }
  const active = activeSet(file, docId);
  const read = scriptAt(doc, file, docId, active.engineVersion);
  if (!read.ok)
    throw new RangeError(`${docId} cannot be laid out: ${read.reason}`);
  const { content, flat, layout, numbers } = read.script;
  const baseline = versionContent(file, active.baselineVersionId).blocks;
  const marks = marksSince(
    baseline,
    content,
    flat,
    overridesOf(doc, active.id),
  );
  return { content, flat, pagination: layout.pagination, numbers, marks };
}

/** The script `docId` as the server's storage holds it now. RangeError for a document that is not placed. */
export function readServerScript(
  storage: Storage,
  docId: string,
): ServerScript {
  const place = storage.directory.placeOf(docId);
  if (place === null) throw new RangeError(`${docId} is not placed`);
  const file = storage.open(place.home);
  const doc = readLogged(file, docId);
  try {
    return scriptOf(doc, file, docId);
  } finally {
    doc.destroy();
  }
}

/** What the server's pages, numbers and marks disagree with in `passage`, written from the block `firstBlockId`. */
export function checkPassage(
  script: ServerScript,
  passage: SeedPassage,
  firstBlockId: string,
): string[] {
  const { flat, numbers, marks } = script;
  const first = flat.findIndex((block) => block.attrs.id === firstBlockId);
  if (first < 0)
    return [`the passage's first block ${firstBlockId} is not in the script`];
  const at = (i: number) => flat[first + i]?.attrs ?? null;
  const starts =
    script.pagination === null ? [] : pageStarts(script.pagination);
  const found: string[] = [];
  for (const { label, blockIndex } of passage.pageStarts) {
    const page = starts.find((start) => start.label === label);
    if (page?.blockIndex !== first + blockIndex)
      found.push(`page ${label} does not start at block ${blockIndex}`);
  }
  for (const { blockIndex, num } of passage.numbers) {
    const attrs = at(blockIndex);
    const held = attrs?.num ?? numbers.get(attrs?.id ?? "") ?? null;
    if (held !== num)
      found.push(`block ${blockIndex} is numbered ${held}, not ${num}`);
  }
  for (const blockIndex of passage.marked)
    if (!marks.has(at(blockIndex)?.id ?? ""))
      found.push(`block ${blockIndex} is not marked revised`);
  for (const blockIndex of passage.omitted)
    if (at(blockIndex)?.omitted !== true)
      found.push(`block ${blockIndex} is not omitted`);
  return found;
}
