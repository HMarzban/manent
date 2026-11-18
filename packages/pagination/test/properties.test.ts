import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  UNITS_PER_LINE,
  breaksIn,
  comparePageLabels,
  endsSentence,
  fillUnits,
  flowUnits,
  layoutPage,
  lineStartsOf,
  paginate,
  profileFor,
  repaginate,
  resolveSpec,
} from "../src/index.ts";
import type {
  ChangeHint,
  LayoutBlock,
  LockAnchor,
  LockTable,
  Page,
  Pagination,
} from "../src/index.ts";
import { NAMES, block, cueBlock, filledBlock } from "../src/testing/index.ts";

const sp = profileFor("screenplay")!;
const a4 = profileFor("screenplay", { paper: "a4" })!;
const CAP = sp.linesPerPage * UNITS_PER_LINE;
const RUNS = 200;
/** A property takes a few seconds, past the runner's default of five. */
const TIMEOUT_MS = 60_000;

const ELEMENTS = [
  "scene_heading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
  "shot",
  "general",
  "page_break",
  "group",
] as const;
type Element = (typeof ELEMENTS)[number];
const KEPT: ReadonlySet<string> = new Set([
  "scene_heading",
  "shot",
  "character",
  "parenthetical",
]);
const SPEECH_LINES: ReadonlySet<string> = new Set([
  "parenthetical",
  "dialogue",
]);
const UNPRINTED: ReadonlySet<string> = new Set(["page_break", "group"]);

/** A block before it has an id: each of its lines at its element's width, true where the line ends a sentence. */
interface BlockSpec {
  readonly type: Element;
  readonly lines: readonly boolean[];
  readonly cue: string;
  readonly dual: "left" | "right" | null;
  readonly width: number | null;
  readonly indent: number | null;
}

interface Limits {
  /** Lines of a block that is not kept with the next. */
  readonly lines: number;
  /** Lines of a kept block or a transition. */
  readonly keptLines: number;
  readonly pageBreaks: boolean;
  /** Width and indent overrides, which make a block as tall as a narrow column makes it. */
  readonly overrides: boolean;
}

const ANY: Limits = {
  lines: 14,
  keptLines: 14,
  pageBreaks: true,
  overrides: true,
};
const TAME: Limits = {
  lines: 20,
  keptLines: 2,
  pageBreaks: false,
  overrides: false,
};

function textOf(spec: BlockSpec): string {
  if (spec.type === "character") return spec.cue;
  if (UNPRINTED.has(spec.type)) return "";
  const { width } = resolveSpec(sp, block(spec.type, "", { dual: spec.dual }));
  return spec.lines
    .map((ends) => "x".repeat(width - 1) + (ends ? "." : "x"))
    .join("");
}

const toBlock = (spec: BlockSpec, id: string): LayoutBlock =>
  block(spec.type, textOf(spec), {
    id,
    dual: spec.dual,
    width: spec.width,
    indent: spec.indent,
  });

const arbOverride = (limits: Limits, max: number) =>
  limits.overrides
    ? fc.oneof(
        { weight: 7, arbitrary: fc.constant(null) },
        { weight: 1, arbitrary: fc.integer({ min: 0, max }) },
      )
    : fc.constant(null);

function arbSpec(
  limits: Limits,
  types: readonly Element[],
  dual: "left" | "right" | null,
): fc.Arbitrary<BlockSpec> {
  return fc
    .record({
      type: fc.constantFrom(...types),
      lines: fc.array(fc.boolean(), { maxLength: limits.lines, size: "max" }),
      cue: fc.constantFrom(...NAMES),
      width: dual === null ? arbOverride(limits, 60) : fc.constant(null),
      indent: dual === null ? arbOverride(limits, 59) : fc.constant(null),
    })
    .map((spec) => ({
      ...spec,
      dual,
      lines:
        KEPT.has(spec.type) || spec.type === "transition"
          ? spec.lines.slice(0, limits.keptLines)
          : spec.lines,
    }));
}

// A cue and one to three of its parentheticals and dialogue.
const arbSpeech = (limits: Limits, dual: "left" | "right" | null) =>
  fc
    .tuple(
      arbSpec(limits, ["character"], dual),
      fc.array(arbSpec(limits, ["parenthetical", "dialogue"], dual), {
        minLength: 1,
        maxLength: 3,
      }),
    )
    .map(([cue, lines]) => [cue, ...lines]);

const arbItem = (limits: Limits): fc.Arbitrary<BlockSpec[]> =>
  fc.oneof(
    {
      weight: 6,
      arbitrary: arbSpec(
        limits,
        ELEMENTS.filter((e) => limits.pageBreaks || e !== "page_break"),
        null,
      ).map((spec) => [spec]),
    },
    { weight: 3, arbitrary: arbSpeech(limits, null) },
    {
      weight: 1,
      arbitrary: fc
        .tuple(arbSpeech(limits, "left"), arbSpeech(limits, "right"))
        .map(([left, right]) => [...left, ...right]),
    },
  );

// A one-line action goes before every fourth kept block in a row.
function withShortKeepChains(specs: readonly BlockSpec[]): BlockSpec[] {
  const out: BlockSpec[] = [];
  let kept = 0;
  for (const spec of specs) {
    if (KEPT.has(spec.type) && spec.dual === null) {
      if (kept === 3) {
        out.push({ ...spec, type: "action", lines: [true] });
        kept = 0;
      }
      kept += 1;
    } else if (!UNPRINTED.has(spec.type)) kept = 0;
    out.push(spec);
  }
  return out;
}

const toScript = (specs: readonly BlockSpec[]) =>
  specs.slice(0, 120).map((spec, i) => toBlock(spec, `s${i}`));

/** 0–120 blocks of the screenplay elements, page_break and group, 0–14 lines each, a dual run now and then. */
const arbScript = fc
  .array(arbItem(ANY), { maxLength: 60, size: "max" })
  .map((items) => toScript(items.flat()));

/** At most 20 lines a block, at most 3 kept in a row, no page_break and no dual run cut short. */
const arbTameScript = fc
  .array(arbItem(TAME), { maxLength: 40, size: "max" })
  .map((items) => withShortKeepChains(items.flat()))
  .filter((specs) => specs.length <= 120)
  .map(toScript);

type Edit =
  | { readonly kind: "insert"; readonly at: number; readonly spec: BlockSpec }
  | { readonly kind: "delete"; readonly at: number }
  | {
      readonly kind: "retype";
      readonly at: number;
      readonly pos: number;
      readonly char: string | null;
    }
  | { readonly kind: "type"; readonly at: number; readonly type: Element }
  | {
      readonly kind: "layout";
      readonly at: number;
      readonly width: number | null;
      readonly indent: number | null;
    }
  | { readonly kind: "fresh" };

// Block 0 one time in four, so an edit at a script's first block is always among the runs.
const arbAt = fc.oneof(
  { weight: 1, arbitrary: fc.constant(0) },
  { weight: 3, arbitrary: fc.nat() },
);

const arbEdit: fc.Arbitrary<Edit> = fc.oneof(
  fc.record({
    kind: fc.constant("insert" as const),
    at: arbAt,
    spec: arbSpec(ANY, ELEMENTS, null),
  }),
  fc.record({ kind: fc.constant("delete" as const), at: arbAt }),
  fc.record({
    kind: fc.constant("retype" as const),
    at: arbAt,
    pos: fc.nat(),
    char: fc.constantFrom(null, "x", ".", " "),
  }),
  fc.record({
    kind: fc.constant("type" as const),
    at: arbAt,
    type: fc.constantFrom(...ELEMENTS),
  }),
  fc.record({
    kind: fc.constant("layout" as const),
    at: arbAt,
    width: fc.option(fc.integer({ min: 0, max: 60 })),
    indent: fc.option(fc.integer({ min: 0, max: 59 })),
  }),
  fc.constant({ kind: "fresh" as const }),
);

/** 1–25 edits. */
const arbEdits = fc.array(arbEdit, { minLength: 1, maxLength: 25 });

const changed = (
  blocks: readonly LayoutBlock[],
  at: number,
  change: Partial<LayoutBlock>,
) => blocks.with(at, Object.freeze({ ...blocks[at]!, ...change }));

// The blocks after an edit, and the change it made; null when the edit finds no block to change.
function applyEdit(
  blocks: readonly LayoutBlock[],
  edit: Edit,
  k: number,
): { blocks: LayoutBlock[]; hint: ChangeHint } | null {
  if (edit.kind === "fresh") {
    const n = blocks.length;
    return {
      blocks: blocks.map((b) => Object.freeze({ ...b })),
      hint: { first: 0, oldEnd: n, newEnd: n },
    };
  }
  if (edit.kind === "insert") {
    const at = edit.at % (blocks.length + 1);
    return {
      blocks: blocks.toSpliced(at, 0, toBlock(edit.spec, `n${k}`)),
      hint: { first: at, oldEnd: at, newEnd: at + 1 },
    };
  }
  if (blocks.length === 0) return null;
  const at = edit.at % blocks.length;
  const one = { first: at, oldEnd: at + 1, newEnd: at + 1 };
  switch (edit.kind) {
    case "delete":
      return {
        blocks: blocks.toSpliced(at, 1),
        hint: { first: at, oldEnd: at + 1, newEnd: at },
      };
    case "retype": {
      const { text } = blocks[at]!;
      const pos = edit.pos % (text.length + 1);
      const typed =
        edit.char === null
          ? text.slice(0, pos) + text.slice(pos + 1)
          : text.slice(0, pos) + edit.char + text.slice(pos);
      return { blocks: changed(blocks, at, { text: typed }), hint: one };
    }
    case "type":
      return { blocks: changed(blocks, at, { type: edit.type }), hint: one };
    case "layout":
      return {
        blocks: changed(blocks, at, { width: edit.width, indent: edit.indent }),
        hint: one,
      };
  }
}

/** The script after each edit that finds a block to change, in order, and the change it made. */
function editsOn(
  blocks: readonly LayoutBlock[],
  edits: readonly Edit[],
): { blocks: LayoutBlock[]; hint: ChangeHint }[] {
  const out: { blocks: LayoutBlock[]; hint: ChangeHint }[] = [];
  edits.forEach((edit, k) => {
    const next = applyEdit(out.at(-1)?.blocks ?? blocks, edit, k);
    if (next !== null) out.push(next);
  });
  return out;
}

const isPrinted = (b: LayoutBlock) => resolveSpec(sp, b).printed;

// The cue of the speech block i carries on, passing over unprinted blocks; null outside a speech or in a dual run.
function speakerOf(blocks: readonly LayoutBlock[], i: number): string | null {
  if (!SPEECH_LINES.has(blocks[i]!.type) || blocks[i]!.dual !== null)
    return null;
  for (let j = i - 1; j >= 0; j--) {
    const b = blocks[j]!;
    if (b.dual !== null) return null;
    if (!isPrinted(b) || SPEECH_LINES.has(b.type)) continue;
    return b.type === "character" && b.text.trim() !== ""
      ? b.text.trim()
      : null;
  }
  return null;
}

// The last printed block before block i; -1 for none.
function printedBefore(blocks: readonly LayoutBlock[], i: number): number {
  for (let j = i - 1; j >= 0; j--) if (isPrinted(blocks[j]!)) return j;
  return -1;
}

const lineText = (p: Pagination, i: number, line: number) => {
  const starts = lineStartsOf(p, i);
  return p.blocks[i]!.text.slice(starts[line - 1], starts[line]);
};

// The cue of the dual column block i is in: the nearest cue at or before it on the same side.
function columnCueOf(blocks: readonly LayoutBlock[], i: number): string | null {
  const side = blocks[i]!.dual;
  for (let j = i; j >= 0 && blocks[j]!.dual === side; j--)
    if (blocks[j]!.type === "character") return blocks[j]!.text.trim();
  return null;
}

// The page opens inside a dual run that was cut, not at the run's first block.
function opensInRun(blocks: readonly LayoutBlock[], page: Page): boolean {
  const { dual } = blocks[page.block]!;
  return (
    dual === "right" ||
    (dual === "left" &&
      (page.line > 0 || blocks[page.block - 1]?.dual === "left"))
  );
}

// A cut dual run puts (MORE) under the page and each column's cue at the next page's top.
function brokenRunRules(p: Pagination, page: Page, next: Page): string[] {
  const contd = columnCueOf(p.blocks, next.block);
  const contdRight =
    next.right === null ? null : columnCueOf(p.blocks, next.right.block);
  return page.more && next.contd === contd && next.contdRight === contdRight
    ? []
    : ["dual furniture"];
}

function brokenBlockRules(p: Pagination, page: Page, next: Page): string[] {
  const b = p.blocks[next.block]!;
  const broken: string[] = [];
  if (next.line === 0) {
    const end = p.blocks[printedBefore(p.blocks, next.block)];
    // a dual run is placed as one unit, never kept with the block after it
    if (end !== undefined && KEPT.has(end.type) && end.dual === null)
      broken.push("ends on kept");
    if (b.type === "transition") broken.push("starts with transition");
  } else {
    const lines = lineStartsOf(p, next.block).length;
    if (next.line < 2 || lines - next.line < 2) broken.push("short split");
    if (
      b.type === "dialogue" &&
      !endsSentence(lineText(p, next.block, next.line))
    )
      broken.push("dialogue split mid-sentence");
  }
  const cue = speakerOf(p.blocks, next.block);
  if (
    page.more !== (cue !== null) ||
    next.contd !== cue ||
    next.contdRight !== null
  )
    broken.push("speech furniture");
  return broken;
}

// What breaks the rules at the break after page k, each named with the page after it.
function brokenRules(p: Pagination, k: number): string[] {
  const page = p.pages[k]!;
  const next = p.pages[k + 1]!;
  const broken = opensInRun(p.blocks, next)
    ? brokenRunRules(p, page, next)
    : brokenBlockRules(p, page, next);
  return broken.map((rule) => `${rule} before page ${k + 2}`);
}

// Every text line of every page, as "block id:line", sorted by block and line: a cut dual run's
// shorter column ends on a page before its longer one does, so page order is not block order.
function linesOnPages(p: Pagination): string[] {
  const index = new Map(p.blocks.map((b, i) => [b.id, i]));
  return p.pages
    .flatMap((_, k) => layoutPage(p, k).lines)
    .filter((l) => l.kind === "text")
    .map((l) => [index.get(l.blockId!)!, l.blockLine] as const)
    .toSorted((x, y) => x[0] - y[0] || x[1] - y[1])
    .map(([i, line]) => `${p.blocks[i]!.id}:${line}`);
}

const anchorAt = (
  blocks: readonly LayoutBlock[],
  page: Page,
  label: string,
): LockAnchor => {
  const { id, text } = blocks[page.block]!;
  return {
    label,
    blockId: id,
    offset: page.offset,
    quote: text.slice(page.offset, page.offset + 12),
    fallbackIds: [],
    source: "lock",
  };
};

test(
  "incremental pagination equals full pagination for any edit sequence",
  () => {
    fc.assert(
      fc.property(arbScript, arbEdits, (blocks, edits) => {
        let prev = paginate(blocks, sp);
        for (const { blocks: next, hint } of editsOn(blocks, edits)) {
          const full = paginate(next, sp).pages;
          expect(repaginate(prev, next, hint).pages).toEqual(full);
          prev = repaginate(prev, next);
          expect(prev.pages).toEqual(full);
        }
      }),
      { numRuns: RUNS },
    );
  },
  TIMEOUT_MS,
);

test(
  "no page exceeds its lines, and every page places one",
  () => {
    fc.assert(
      fc.property(arbScript, (blocks) => {
        const p = paginate(blocks, sp);
        const used = p.pages.map((x) => x.usedUnits);
        if (blocks.some(isPrinted))
          expect(used.filter((u) => u <= 0 || u > CAP)).toEqual([]);
        else expect(used).toEqual([0]);
      }),
      { numRuns: RUNS },
    );
  },
  TIMEOUT_MS,
);

test(
  "the rules hold",
  () => {
    fc.assert(
      fc.property(arbTameScript, (blocks) => {
        const p = paginate(blocks, sp);
        const broken = p.pages.slice(1).flatMap((_, k) => brokenRules(p, k));
        expect([broken, p.pages.at(-1)!.more]).toEqual([[], false]);
      }),
      { numRuns: RUNS },
    );
  },
  TIMEOUT_MS,
);

test(
  "lines are conserved",
  () => {
    fc.assert(
      fc.property(arbScript, (blocks) => {
        const p = paginate(blocks, sp);
        const n = blocks.length;
        const last = p.pages.length - 1;
        expect(linesOnPages(p)).toEqual(
          blocks.flatMap((b, i) =>
            Array.from(lineStartsOf(p, i), (_, line) => `${b.id}:${line}`),
          ),
        );
        expect([
          flowUnits(p, 0, n) + fillUnits(p, last),
          breaksIn(p, 0, n),
        ]).toEqual([p.pages.length * CAP, last]);
      }),
      { numRuns: RUNS },
    );
  },
  TIMEOUT_MS,
);

test(
  "line breaks are the same on Letter and A4",
  () => {
    fc.assert(
      fc.property(arbScript, (blocks) => {
        const letter = paginate(blocks, sp);
        const onA4 = paginate(blocks, a4);
        expect(blocks.map((_, i) => [...lineStartsOf(onA4, i)])).toEqual(
          blocks.map((_, i) => [...lineStartsOf(letter, i)]),
        );
      }),
      { numRuns: RUNS },
    );
  },
  TIMEOUT_MS,
);

// Places a lock may name: the start of a printed block outside a dual run, or an offset inside one.
const placesOf = (blocks: readonly LayoutBlock[]) =>
  blocks.flatMap((b, i) =>
    isPrinted(b) && b.dual === null
      ? [
          { block: i, offset: 0 },
          ...(b.text.length > 1 ? [{ block: i, offset: -1 }] : []),
        ]
      : [],
  );

test(
  "every kept lock starts its page, in order",
  () => {
    const arbLocked = arbScript.chain((blocks) => {
      const places = placesOf(blocks);
      return fc.tuple(
        fc.constant(blocks),
        fc.subarray(places),
        fc.array(fc.nat(), {
          minLength: places.length,
          maxLength: places.length,
        }),
        fc.boolean(),
      );
    });
    fc.assert(
      fc.property(arbLocked, ([blocks, chosen, offsets, quoted]) => {
        const places = chosen.map((place, k) => {
          const { text } = blocks[place.block]!;
          return {
            block: place.block,
            offset:
              place.offset === 0 ? 0 : 1 + (offsets[k]! % (text.length - 1)),
          };
        });
        const anchors = places.map(({ block: i, offset }, k): LockAnchor => ({
          label: String(k + 1),
          blockId: blocks[i]!.id,
          offset,
          quote: quoted ? blocks[i]!.text.slice(offset, offset + 12) : null,
          fallbackIds: [],
          source: "lock",
        }));
        const p = paginate(blocks, sp, { level: 1, anchors });
        expect(
          p.pages
            .filter((x) => x.locked)
            .map((x) => [x.label, x.block, x.offset]),
        ).toEqual(
          places.map(({ block: i, offset }, k) => [String(k + 1), i, offset]),
        );
      }),
      { numRuns: RUNS },
    );
  },
  TIMEOUT_MS,
);

/** A script, where an overflow goes, its lines, which A-pages are locked (every n-th) and the edits after. */
type LockedScript = readonly [
  LayoutBlock[],
  number,
  number,
  number,
  readonly Edit[],
];

const arbLockedScript: fc.Arbitrary<LockedScript> = fc.tuple(
  arbScript,
  fc.nat(),
  fc.integer({ min: 20, max: 120 }),
  fc.integer({ min: 1, max: 3 }),
  arbEdits,
);

// The labels of a script locked at every page, then overflowed after the first block of one page, its
// A-pages locked at level 2 every n-th, then edited: once for each script on the way.
function labelsOfLocked([
  blocks,
  overflowAt,
  lines,
  every,
  edits,
]: LockedScript): string[][] {
  const p0 = paginate(blocks, sp);
  const level1: LockTable = {
    level: 1,
    // the one page of an empty script starts at no block
    anchors:
      blocks.length === 0
        ? []
        : p0.pages.map((page, k) => anchorAt(blocks, page, String(k + 1))),
  };
  const overflowed = blocks.toSpliced(
    p0.pages[overflowAt % p0.pages.length]!.block + 1,
    0,
    filledBlock("action", lines, { id: "overflow" }),
  );
  const aPages = paginate(overflowed, sp, level1)
    .pages.filter((page) => !page.locked)
    .filter((_, j) => j % every === 0)
    .map((page) => anchorAt(overflowed, page, page.label));
  const index = new Map(overflowed.map((b, i) => [b.id, i]));
  const level2: LockTable = {
    level: 2,
    anchors: [...level1.anchors, ...aPages].toSorted(
      (x, y) =>
        index.get(x.blockId)! - index.get(y.blockId)! || x.offset - y.offset,
    ),
  };
  return [overflowed, ...editsOn(overflowed, edits).map((e) => e.blocks)].map(
    (next) => paginate(next, sp, level2).pages.map((x) => x.label),
  );
}

test(
  "no page label is given twice, and labels sort in page order",
  () => {
    fc.assert(
      fc.property(arbLockedScript, (script) => {
        for (const labels of labelsOfLocked(script))
          expect([
            new Set(labels).size,
            labels.toSorted(comparePageLabels),
          ]).toEqual([labels.length, labels]);
      }),
      { numRuns: RUNS },
    );
  },
  TIMEOUT_MS,
);

test("a page locked where it already starts inside a block moves no page", () => {
  const blocks = [
    filledBlock("action", 49, { id: "a" }),
    filledBlock("action", 5, { id: "b" }),
  ];
  const free = paginate(blocks, sp);
  const locked = paginate(blocks, sp, {
    level: 1,
    anchors: [anchorAt(blocks, free.pages[1]!, "2")],
  });
  expect(locked.pages.map((x) => [x.label, x.block, x.line])).toEqual([
    ["1", 0, 0],
    ["2", 1, 3],
  ]);
});

test("a block added at the end refills a page that read to the old end", () => {
  const tall = block("scene_heading", "x".repeat(60), { id: "a", width: 0 });
  const added = [tall, block("scene_heading", "", { id: "b", width: 0 })];
  expect(repaginate(paginate([tall], sp), added).pages).toEqual(
    paginate(added, sp).pages,
  );
});

// A dual run: `lines` lines of `kind` under the left cue, one under the right.
const dualRun = (kind: "parenthetical" | "dialogue", lines: number) => [
  cueBlock("MARA", { dual: "left" }),
  filledBlock(kind, lines, { dual: "left" }),
  cueBlock("COLE", { dual: "right" }),
  filledBlock(kind, 1, { dual: "right" }),
];
const cutTo = () => block("transition", "CUT TO:");
const startsOf = (blocks: readonly LayoutBlock[]) =>
  paginate(blocks, sp).pages.map((x) => [x.block, x.line]);

test("a dual run ending on a parenthetical leaves no heading alone under it", () => {
  expect(
    startsOf([
      ...dualRun("parenthetical", 25),
      filledBlock("scene_heading", 1),
      ...dualRun("dialogue", 25),
    ]),
  ).toEqual([
    [0, 0],
    [4, 0],
  ]);
});

test("a transition never starts a page, after a dual run or after another transition", () => {
  expect([
    startsOf([filledBlock("action", 41), ...dualRun("dialogue", 10), cutTo()]),
    startsOf([...dualRun("dialogue", 52), cutTo()]),
    startsOf([filledBlock("action", 51), cutTo(), cutTo()]),
  ]).toEqual([
    [
      [0, 0],
      [1, 0],
    ],
    [
      [0, 0],
      [1, 50],
    ],
    [
      [0, 0],
      [0, 49],
    ],
  ]);
});
