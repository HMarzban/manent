import { expect, test } from "bun:test";
import fc from "fast-check";
import type { LayoutBlock } from "@manent/pagination";
import { block } from "@manent/pagination/testing";
import type { BlockJSON } from "@manent/schema";
import { layoutImpact, productionChecks } from "../src/index.ts";
import type { LockedLayout } from "../src/index.ts";
import {
  ISSUED,
  LONG_RECORDS,
  RECORDS,
  SCREENPLAY,
  TYPED,
  deletedPage13,
  flatOf,
  hardCases,
  labelsOf,
  layoutOf,
  movedPages12To13,
  omittedOn20,
  pagesUnder,
  restoredFromBeforeLock,
  v1,
} from "./production-fixtures.ts";
import type { HardCase } from "./production-fixtures.ts";
import { blockJSONs } from "./history-docs.ts";

const CASES = new Map(hardCases().map((c) => [c.name, c]));
const hardCase = (name: string): HardCase => CASES.get(name)!;
const LOCKED_LABELS = hardCase("as locked").labels;
const laidOut = (c: HardCase): LockedLayout => pagesUnder(c.blocks, c.records);
const pageLabeled = (layout: LockedLayout, label: string) =>
  layout.pagination.pages.find((page) => page.label === label)!;
const checksOf = (blocks: readonly BlockJSON[]) =>
  productionChecks({
    flat: flatOf(blocks),
    layout: pagesUnder(layoutOf(blocks), RECORDS),
    records: RECORDS,
    issued: ISSUED,
  });

test("a locked page edited until it overflows, then shrunk back", () => {
  const grown = hardCase("page 12 grows by 60 lines");
  const locked = new Set(hardCase("as locked").blocks.map((b) => b.id));
  const shrunk = grown.blocks.filter((b) => locked.has(b.id));
  expect([
    labelsOf(laidOut(grown)),
    labelsOf(pagesUnder(shrunk, grown.records)),
  ]).toEqual([grown.labels, LOCKED_LABELS]);
});

test("an issued A-page that shrinks stays a short page", () => {
  const c = hardCase("an issued 12A shrinks");
  const layout = laidOut(c);
  const page = pageLabeled(layout, "12A");
  // 24 lines of the page's 54
  expect([labelsOf(layout), page.locked, page.usedUnits]).toEqual([
    c.labels,
    true,
    48,
  ]);
});

test("a whole locked page deleted prints as a range", () => {
  const c = hardCase("page 13 deleted");
  expect(labelsOf(laidOut(c))).toEqual(c.labels);
});

test("a scene omitted, then brought back", () => {
  const c = hardCase("the first scene on page 20 omitted");
  const omitted = omittedOn20();
  const heading = omitted.find((b) => b.attrs?.omitted === true)!;
  const back = omitted.map((b) =>
    b === heading ? { ...b, attrs: { ...b.attrs, omitted: false } } : b,
  );
  const layout = laidOut(c);
  expect([
    labelsOf(layout),
    c.blocks.find((b) => b.id === heading.attrs?.id)!.text,
    [
      pageLabeled(pagesUnder(layoutOf(back), RECORDS), "20").usedUnits,
      pageLabeled(layout, "20").usedUnits,
    ],
    labelsOf(pagesUnder(layoutOf(back), RECORDS)),
  ]).toEqual([c.labels, "OMITTED", [98, 50], LOCKED_LABELS]);
});

test("a scene moved across locked pages", () => {
  const c = hardCase("pages 12 and 13 moved after page 30");
  expect([labelsOf(laidOut(c)), checksOf(movedPages12To13())]).toEqual([
    c.labels,
    [
      { kind: "numbers_unchanged", ok: true },
      { kind: "pages_moved", ok: false, pages: ["12", "13"] },
      { kind: "overflow", ok: false, page: "30", next: "30A" },
    ],
  ]);
});

test("Letter to A4 on a locked script", () => {
  const c = hardCase("as locked");
  const a4 = v1.profileFor("screenplay", { paper: "a4" })!;
  const impact = layoutImpact(c.blocks, SCREENPLAY, a4, c.records, v1);
  expect([
    labelsOf(pagesUnder(c.blocks, c.records, a4)),
    impact.gainAPages,
    impact.fallShort,
  ]).toEqual([LOCKED_LABELS, [], LOCKED_LABELS]);
});

test("an edit inside a block that spans three pages", () => {
  const c = hardCase(
    "a block spanning three pages edited before its second page",
  );
  const long = LONG_RECORDS.find((r) => r.label === "13")!.blockId;
  expect([
    LONG_RECORDS.filter((r) => r.blockId === long).map((r) => [
      r.label,
      r.offset,
    ]),
    labelsOf(laidOut(c)),
  ]).toEqual([
    [
      ["13", 122],
      ["14", 3416],
      ["15", 6710],
    ],
    c.labels,
  ]);
});

test("an anchor whose quote moved follows it", () => {
  const c = hardCase("text typed before an anchor's quote");
  const layout = laidOut(c);
  const page = pageLabeled(layout, "12");
  const anchor = RECORDS.find((r) => r.label === "12")!;
  expect([
    labelsOf(layout),
    layout.pagination.blocks[page.block]!.id,
    page.offset,
  ]).toEqual([c.labels, anchor.blockId, anchor.offset + TYPED.length]);
});

test("restoring a version from before lock keeps every page number", () => {
  const c = hardCase("a version from before lock restored");
  const numbers = flatOf(blockJSONs(restoredFromBeforeLock()))
    .filter((b) => b.attrs.type === "scene_heading")
    .map((b) => ({ blockId: b.attrs.id, num: b.attrs.num }));
  expect([labelsOf(laidOut(c)), numbers]).toEqual([
    LOCKED_LABELS,
    ISSUED.map(({ blockId, num }) => ({ blockId, num })),
  ]);
});

test("an empty locked page is listed by the checks", () => {
  expect([
    checksOf(deletedPage13()),
    labelsOf(laidOut(hardCase("page 13 deleted")))[12],
  ]).toEqual([
    [
      { kind: "numbers_changed", ok: false, scenes: ["14"] },
      { kind: "pages_intact", ok: true },
      { kind: "empty_page", ok: false, page: "13" },
    ],
    "13–14",
  ]);
});

const EDITS = [
  "type",
  "delete",
  "split",
  "join",
  "insert_block",
  "delete_block",
  "move_scene",
] as const;
type EditKind = (typeof EDITS)[number];
interface Edit {
  readonly kind: EditKind;
  readonly a: number;
  readonly b: number;
  readonly c: number;
}
const TYPES = ["action", "dialogue", "character", "scene_heading"];
const TEXTS = [
  "Wait.",
  "She turns back to the door and listens for the train. ",
  "x".repeat(59).concat(". ").repeat(30),
];

// The script and the blocks [lo, hi) the edits may touch: those wholly on the pages they are confined to.
interface Region {
  readonly blocks: LayoutBlock[];
  readonly lo: number;
  readonly hi: number;
  readonly added: number;
}

const withText = (b: LayoutBlock, text: string): LayoutBlock =>
  Object.freeze({ ...b, text, styles: null });

function replaced(
  r: Region,
  at: number,
  count: number,
  items: readonly LayoutBlock[],
): Region {
  return {
    blocks: r.blocks.toSpliced(at, count, ...items),
    lo: r.lo,
    hi: r.hi - count + items.length,
    added: r.added + 1,
  };
}

const addedId = (r: Region) => `added-${r.added}`;

function moveScene(r: Region, e: Edit): Region {
  const heads = r.blocks
    .slice(r.lo, r.hi)
    .flatMap((b, i) => (b.type === "scene_heading" ? [r.lo + i] : []));
  if (heads.length === 0) return r;
  const from = heads[e.a % heads.length]!;
  const end = heads.find((h) => h > from) ?? r.hi;
  const run = r.blocks.slice(from, end);
  const rest = r.blocks.toSpliced(from, run.length);
  const to = r.lo + (e.b % (r.hi - r.lo - run.length + 1));
  return { ...r, blocks: rest.toSpliced(to, 0, ...run) };
}

function applyEdit(r: Region, e: Edit): Region {
  const size = r.hi - r.lo;
  if (size === 0 && e.kind !== "insert_block") return r;
  const i = r.lo + (e.a % Math.max(size, 1));
  const target = r.blocks[i]!;
  const at = e.b % (target.text.length + 1);
  const text = TEXTS[e.c % TEXTS.length]!;
  switch (e.kind) {
    case "type":
      return replaced(r, i, 1, [
        withText(
          target,
          target.text.slice(0, at) + text + target.text.slice(at),
        ),
      ]);
    case "delete": {
      const length = e.c % (target.text.length - at + 1);
      return replaced(r, i, 1, [
        withText(
          target,
          target.text.slice(0, at) + target.text.slice(at + length),
        ),
      ]);
    }
    case "split":
      return replaced(r, i, 1, [
        withText(target, target.text.slice(0, at)),
        block(target.type, target.text.slice(at), { id: addedId(r) }),
      ]);
    case "join": {
      if (size < 2) return r;
      const first = r.lo + (e.a % (size - 1));
      const [a, b] = [r.blocks[first]!, r.blocks[first + 1]!];
      return replaced(r, first, 2, [withText(a, a.text + b.text)]);
    }
    case "insert_block":
      return replaced(r, r.lo + (e.a % (size + 1)), 0, [
        block(TYPES[e.b % TYPES.length]!, text, { id: addedId(r) }),
      ]);
    case "delete_block":
      return replaced(r, i, 1, []);
    case "move_scene":
      return moveScene(r, e);
  }
}

const LOCKED_BLOCKS = hardCase("as locked").blocks;
const LOCKED_PAGES = pagesUnder(LOCKED_BLOCKS, RECORDS).pagination.pages;

function regionOf(k: number, m: number): Region {
  const first = LOCKED_PAGES[k - 1]!;
  const lo = first.line === 0 ? first.block : first.block + 1;
  return {
    blocks: [...LOCKED_BLOCKS],
    lo,
    hi: Math.max(lo, LOCKED_PAGES[m]!.block),
    added: 0,
  };
}

// The labels outside k…m whose page does not start at its anchor's block and offset.
function misplaced(layout: LockedLayout, k: number, m: number): string[] {
  const { pages, blocks } = layout.pagination;
  return RECORDS.filter((r) => Number(r.label) < k || Number(r.label) > m)
    .filter((r) => {
      const page = pages.find((p) => p.label.split("–").includes(r.label));
      return (
        page === undefined ||
        blocks[page.block]!.id !== r.blockId ||
        page.offset !== r.offset
      );
    })
    .map((r) => r.label);
}

const edit: fc.Arbitrary<Edit> = fc.record({
  kind: fc.constantFrom(...EDITS),
  a: fc.nat(),
  b: fc.nat(),
  c: fc.nat(),
});

const DELETE_FIRST: Edit = { kind: "delete_block", a: 0, b: 0, c: 0 };

test("locking then editing never renumbers an untouched locked page", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 2, max: 46 }),
      fc.integer({ min: 0, max: 6 }),
      fc.array(edit, { maxLength: 20 }),
      (k, width, edits) => {
        const m = Math.min(46, k + width);
        const edited = edits.reduce(applyEdit, regionOf(k, m));
        expect(misplaced(pagesUnder(edited.blocks, RECORDS), k, m)).toEqual([]);
      },
    ),
    // Also every block of page 13 deleted, so that its label joins page 14's.
    {
      numRuns: 300,
      examples: [[13, 0, Array.from({ length: 16 }, () => DELETE_FIRST)]],
    },
  );
}, 60_000);
