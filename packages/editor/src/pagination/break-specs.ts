// Where each page break is drawn in the document and what it shows: the furniture of the pages on either side.
import { engineFor } from "@manent/pagination";
import type { Engine, Pagination } from "@manent/pagination";
import type { BreakStyle } from "../page/config.ts";
import { blockPos } from "./block-index.ts";
import type { BlockIndex } from "./block-index.ts";

export const BREAK_KINDS = [
  "first",
  "page",
  "mid",
  "col",
  "last",
  "rule",
] as const;
export type BreakKind = (typeof BREAK_KINDS)[number];

/** One page break as drawn; each text is null when its child is not drawn. */
export interface BreakSpec {
  readonly kind: BreakKind;
  /** A position inside a section. */
  readonly pos: number;
  /** Holds everything that changes the break's DOM. */
  readonly key: string;
  /** The label of the page below. */
  readonly label: string;
  /** Units of blank at the foot of the page above. */
  readonly fillUnits: number;
  readonly more: string | null;
  readonly foot: string | null;
  readonly head: string | null;
  readonly continued: string | null;
  readonly contd: string | null;
  readonly side: -1 | 1;
}

type SpecFields = Omit<BreakSpec, "key" | "side">;

const NO_TEXT = {
  more: null,
  foot: null,
  head: null,
  continued: null,
  contd: null,
} as const;

/** Throws RangeError when this build does not carry the engine that made the pagination. */
function engineOf(p: Pagination): Engine {
  const engine = engineFor(p.engineVersion);
  if (engine === null)
    throw new RangeError(`this build carries no engine ${p.engineVersion}`);
  return engine;
}

const flag = (text: string | null) => (text === null ? 0 : 1);

function createSpec(fields: SpecFields, side: -1 | 1 = -1): BreakSpec {
  const { kind, label, fillUnits, more, foot, continued, contd } = fields;
  return {
    ...fields,
    key: `pb:${kind}:${label}:${fillUnits}:${flag(more)}:${flag(foot)}:${flag(continued)}:${contd ?? ""}`,
    side,
  };
}

/** The position `offset` units into block `block`'s text, kept inside the text the document holds. */
function textPos(index: BlockIndex, block: number, offset: number): number {
  const pos = blockPos(index, block);
  return pos + 1 + Math.min(offset, index.doc.nodeAt(pos)!.content.size);
}

// The breaks that open page k > 0: before or inside its first block, and at the right column's resume point.
function breaksBefore(
  index: BlockIndex,
  p: Pagination,
  engine: Engine,
  k: number,
  style: BreakStyle,
): BreakSpec[] {
  const { furniture } = p.profile;
  const page = p.pages[k]!;
  // a cue that already ends in the suffix is drawn as it reads, as on the printed page
  const contdOf = (cue: string | null) =>
    cue === null || cue.endsWith(furniture.contdText.trim())
      ? cue
      : cue + furniture.contdText;
  const shared = {
    label: page.label,
    fillUnits: engine.fillUnits(p, k - 1),
    more: p.pages[k - 1]!.more ? furniture.moreText : null,
    foot: page.sceneContinued ? furniture.continuedFootText : null,
    head: engine.pageNumberText(page),
    continued: page.sceneContinued ? furniture.continuedTopText : null,
  };
  const inside = page.line > 0 && style === "inline";
  const specs = [
    createSpec({
      ...shared,
      kind: inside ? "mid" : "page",
      pos: inside
        ? textPos(index, page.block, page.offset)
        : blockPos(index, page.block),
      contd: contdOf(page.contd),
    }),
  ];
  const { right } = page;
  if (right !== null)
    specs.push(
      createSpec({
        ...shared,
        kind: "col",
        pos:
          right.line > 0
            ? textPos(index, right.block, right.offset)
            : blockPos(index, right.block),
        contd: contdOf(page.contdRight),
      }),
    );
  return specs;
}

/** Every page break of the pagination, in document order; with style "before_block" a break inside a block is drawn before it. */
export function toBreakSpecs(
  index: BlockIndex,
  p: Pagination,
  style: BreakStyle,
): BreakSpec[] {
  const engine = engineOf(p);
  const last = p.pages.length - 1;
  const first = createSpec({
    ...NO_TEXT,
    kind: "first",
    pos: blockPos(index, 0),
    label: p.pages[0]!.label,
    fillUnits: 0,
  });
  const between = p.pages
    .slice(1)
    .flatMap((_, i) => breaksBefore(index, p, engine, i + 1, style));
  const closing = createSpec(
    {
      ...NO_TEXT,
      kind: "last",
      pos: blockPos(index, index.blocks.length),
      label: p.pages[last]!.label,
      fillUnits: engine.fillUnits(p, last),
    },
    1,
  );
  return [first, ...between, closing].toSorted((a, b) => a.pos - b.pos);
}

/** Reflow view's breaks: a rule labelled with each page's label before the block the page starts in, page 1 included. */
export function toRuleSpecs(index: BlockIndex, p: Pagination): BreakSpec[] {
  return p.pages.map((page) =>
    createSpec({
      ...NO_TEXT,
      kind: "rule",
      pos: blockPos(index, page.block),
      label: page.label,
      fillUnits: 0,
    }),
  );
}
