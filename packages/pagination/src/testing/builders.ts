// Frozen layout blocks and block views for tests, sized in lines of the screenplay page.
import type { Alignment, BlockAttrs, BlockView, Dual } from "@manent/schema";
import { corpusId } from "./corpus.ts";
import type { CorpusBlock } from "./corpus.ts";

interface LayoutBlock {
  readonly id: string;
  readonly type: string;
  readonly kind: string | null;
  readonly text: string;
  readonly styles: Uint8Array | null;
  readonly dual: Dual | null;
  readonly num: string | null;
  readonly align: Alignment | null;
  readonly indent: number | null;
  readonly width: number | null;
  readonly spaceBefore: number | null;
  readonly noContd: boolean;
}

/** Cells to a line of each element on the screenplay page; null for an element that prints nothing. */
const SCREENPLAY_WIDTHS = {
  scene_heading: 60,
  action: 60,
  shot: 60,
  general: 60,
  transition: 60,
  character: 38,
  parenthetical: 25,
  dialogue: 35,
  page_break: null,
  group: null,
} as const;
type ScreenplayElement = keyof typeof SCREENPLAY_WIDTHS;
const DUAL_DIALOGUE_WIDTH = 28;

const DEFAULT_ATTRS: BlockAttrs = Object.freeze({
  id: null,
  type: "action",
  num: null,
  omitted: false,
  dual: null,
  synopsis: "",
  align: null,
  indent: null,
  width: null,
  spaceBefore: null,
  noContd: false,
  noTiming: false,
  writerUserId: null,
  suggest: null,
  from: null,
  kind: null,
  suggestId: null,
  suggestAuthorUserId: null,
  suggestAt: null,
  tags: Object.freeze([]),
  linkTo: null,
  graphic: null,
});

/** Text of `lines` lines of `width` cells, each ending a sentence. */
export function filledText(width: number, lines: number): string {
  return ("x".repeat(width - 1) + ".").repeat(lines);
}

/** Text of `lines` lines of `width` cells with no sentence end and no space. */
export function unbrokenText(width: number, lines: number): string {
  return "x".repeat(width * lines);
}

/** A block view with every attribute not given at its default; each run is its text, then its mark names. */
export function viewOf(
  attrs: Partial<BlockAttrs>,
  ...runs: readonly (readonly [string, ...string[]])[]
): BlockView {
  return Object.freeze({
    attrs: Object.freeze({ ...DEFAULT_ATTRS, ...attrs }),
    runs: Object.freeze(
      runs.map(([text, ...marks]) =>
        Object.freeze({ text, marks: Object.freeze(marks) }),
      ),
    ),
  });
}

/** A frozen block with no style, overrides or extras but those given; a fresh random id unless one is given. */
export function block(
  type: string,
  text: string,
  extra: Partial<LayoutBlock> = {},
): LayoutBlock {
  return Object.freeze({
    id: extra.id ?? crypto.randomUUID(),
    type,
    kind: null,
    text,
    styles: null,
    dual: null,
    num: null,
    align: null,
    indent: null,
    width: null,
    spaceBefore: null,
    noContd: false,
    ...extra,
  });
}

function sizedBlock(
  type: ScreenplayElement,
  lines: number,
  extra: Partial<LayoutBlock>,
  fill: (width: number, lines: number) => string,
): LayoutBlock {
  const width =
    type === "dialogue" && (extra.dual ?? null) !== null
      ? DUAL_DIALOGUE_WIDTH
      : SCREENPLAY_WIDTHS[type];
  return block(type, width === null ? "" : fill(width, lines), extra);
}

/** A block of `lines` lines at its element's screenplay width, each ending a sentence; empty for an element that prints nothing. */
export function filledBlock(
  type: ScreenplayElement,
  lines: number,
  extra: Partial<LayoutBlock> = {},
): LayoutBlock {
  return sizedBlock(type, lines, extra, filledText);
}

/** As filledBlock, with no sentence end. */
export function unbrokenBlock(
  type: ScreenplayElement,
  lines: number,
  extra: Partial<LayoutBlock> = {},
): LayoutBlock {
  return sizedBlock(type, lines, extra, unbrokenText);
}

/** A character block: the cue of a speech. */
export function cueBlock(
  name: string,
  extra: Partial<LayoutBlock> = {},
): LayoutBlock {
  return block("character", name, extra);
}

/** Block i has the id corpusId(i). */
export function layoutBlocksOf(blocks: readonly CorpusBlock[]): LayoutBlock[] {
  return blocks.map((corpus, i) =>
    block(corpus.type, corpus.text, {
      id: corpusId(i),
      kind: corpus.kind,
      dual: corpus.dual,
    }),
  );
}
