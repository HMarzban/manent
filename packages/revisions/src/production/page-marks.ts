// The lines a revision's marks fall on, and the colour, header and marks each page takes from them.
import { engineFor } from "@manent/pagination";
import type { Engine, LaidOutPage, Page, Pagination } from "@manent/pagination";
import type { RevisionColour } from "./colours.ts";
import { revisionHeader } from "./header.ts";
import type { BlockMark, RevisionSource } from "./marks.ts";
import type { MarkMode } from "./model.ts";

/** What a revised page draws: its band's colour and name, its header, and each mark at its line's height (units, as PositionedLine.y), top first. */
export interface PageRevision {
  readonly colour: RevisionColour;
  readonly name: string;
  readonly header: string;
  readonly marks: readonly { readonly y: number; readonly text: string }[];
}

interface ModeRule {
  /** The sources, oldest first, whose marks the mode shows. */
  admit(sources: readonly RevisionSource[]): readonly RevisionSource[];
  /** `page`: only the marks of the source the page takes; `every`: every admitted source's. */
  readonly draws: "page" | "every";
}

const MODE_RULES: Readonly<Record<MarkMode, ModeRule>> = Object.freeze({
  collated: { admit: (sources) => sources, draws: "page" },
  this_revision: { admit: (sources) => sources.slice(-1), draws: "page" },
  all: { admit: (sources) => sources, draws: "every" },
  since_full_draft: {
    admit: (sources) =>
      sources.slice(sources.findLastIndex((source) => source.fullDraft) + 1),
    draws: "every",
  },
  none: { admit: () => [], draws: "page" },
});

function engineOf(p: Pagination): Engine {
  const engine = engineFor(p.engineVersion);
  if (engine === null)
    throw new RangeError(
      `this build carries no layout engine ${p.engineVersion}`,
    );
  return engine;
}

/** The last line whose start is at or before `offset`. */
function lineAt(starts: Int32Array, offset: number): number {
  let line = 0;
  while (line + 1 < starts.length && starts[line + 1]! <= offset) line++;
  return line;
}

/** Each block the page may draw a line of, by id: from its first block to the last one its filling examined. */
function blocksOn(p: Pagination, page: Page): Map<string, number> {
  const indexes = new Map<string, number>();
  const last = Math.min(page.readAhead, p.blocks.length - 1);
  for (let i = page.block; i <= last; i++) {
    const id = p.blocks[i]!.id;
    if (!indexes.has(id)) indexes.set(id, i);
  }
  return indexes;
}

/** The heights of the text lines of `page` that `marks` marks, top first. */
function markedHeights(
  p: Pagination,
  page: LaidOutPage,
  marks: ReadonlyMap<string, BlockMark>,
): number[] {
  // laid out, so its index is one of the pagination's pages
  const indexes = blocksOn(p, p.pages[page.index]!);
  const linesOf = new Map<string, readonly number[]>();
  const heights: number[] = [];
  for (const line of page.lines) {
    if (line.kind !== "text" || line.blockId === null) continue;
    const mark = marks.get(line.blockId);
    const index = indexes.get(line.blockId);
    if (mark === undefined || index === undefined) continue;
    const lines = linesOf.get(line.blockId) ?? blockMarkedLines(p, index, mark);
    linesOf.set(line.blockId, lines);
    if (lines.includes(line.blockLine)) heights.push(line.y);
  }
  return heights;
}

/**
 * The lines of block `block`, as the pagination's own engine placed them,
 * that `mark` marks, ascending: every line of a whole mark; a line an
 * inserted range overlaps; the line a deletion offset falls inside, or the
 * line before when it falls at that line's start. RangeError for a
 * pagination whose engine this build does not carry.
 */
export function blockMarkedLines(
  p: Pagination,
  block: number,
  mark: BlockMark,
): number[] {
  const starts = engineOf(p).lineStartsOf(p, block);
  if (mark.kind === "whole") return Array.from(starts, (_, line) => line);
  if (starts.length === 0) return [];
  const marked = new Set<number>();
  for (const [from, to] of mark.inserted)
    for (
      let line = lineAt(starts, from);
      line < starts.length && starts[line]! < to;
      line++
    )
      marked.add(line);
  for (const offset of mark.deletedAt) {
    const line = lineAt(starts, offset);
    marked.add(line > 0 && starts[line] === offset ? line - 1 : line);
  }
  return [...marked].toSorted((a, b) => a - b);
}

/**
 * What page `pageIndex` draws for its revision; null when no source the mode
 * admits marks a line on it. `sources` are oldest first, the active one
 * last. The page takes the latest admitted source that marks a line on it;
 * where the mode draws every admitted source's marks, a line two sources
 * mark draws the later one's.
 */
export function pageRevision(
  p: Pagination,
  pageIndex: number,
  sources: readonly RevisionSource[],
  mode: MarkMode,
): PageRevision | null {
  const rule = MODE_RULES[mode];
  const admitted = rule.admit(sources);
  if (admitted.length === 0) return null;
  const page = engineOf(p).layoutPage(p, pageIndex);
  const heights = admitted.map((source) =>
    markedHeights(p, page, source.marks),
  );
  const latest = heights.findLastIndex((ys) => ys.length > 0);
  const source = admitted[latest];
  if (source === undefined) return null;
  const marks = new Map<number, string>();
  admitted.forEach((drawn, k) => {
    if (rule.draws === "page" && k !== latest) return;
    for (const y of heights[k]!) marks.set(y, drawn.mark);
  });
  return {
    colour: source.colour,
    name: source.name,
    header: revisionHeader(source.name, source.day),
    marks: [...marks]
      .toSorted(([a], [b]) => a - b)
      .map(([y, text]) => ({ y, text })),
  };
}

/** The labels of the pages holding a line `marks` marks, in page order. */
export function revisedPages(
  p: Pagination,
  marks: ReadonlyMap<string, BlockMark>,
): string[] {
  const engine = engineOf(p);
  return p.pages
    .filter(
      (page) =>
        markedHeights(p, engine.layoutPage(p, page.index), marks).length > 0,
    )
    .map((page) => page.label);
}
