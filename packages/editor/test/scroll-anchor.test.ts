import { expect, test } from "bun:test";
import { ENGINE_VERSION, UNIT_PX, engineFor } from "@manent/pagination";
import type { ChangeHint, LayoutBlock, Pagination } from "@manent/pagination";
import {
  block,
  generateBlocks,
  layoutBlocksOf,
} from "@manent/pagination/testing";
import fc from "fast-check";
import {
  PAGE_GAP_PX,
  anchorShiftPx,
  blockTopPx,
  screenPagePx,
} from "../src/index.ts";

const engine = engineFor(ENGINE_VERSION)!;
const sp = engine.profileFor("screenplay")!;

const ELEMENTS = [
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "scene_heading",
  "transition",
  "page_break",
  "general",
] as const;

type Edit =
  | { readonly kind: "insert"; readonly at: number; readonly lines: number }
  | { readonly kind: "delete"; readonly at: number; readonly count: number }
  | {
      readonly kind: "element";
      readonly at: number;
      readonly type: (typeof ELEMENTS)[number];
    };

interface EditAbove {
  readonly kind: Edit["kind"];
  readonly before: Pagination;
  readonly after: Pagination;
  readonly change: ChangeHint;
  readonly anchorAfter: number;
}

const line = (i: number): LayoutBlock =>
  block("action", `A new line ${i}.`, { id: `new_${i}` });

/** The blocks after the edit and the change hint that says which it replaced. */
function applyEdit(
  blocks: readonly LayoutBlock[],
  edit: Edit,
): { blocks: LayoutBlock[]; change: ChangeHint } {
  const at = edit.at % blocks.length;
  switch (edit.kind) {
    case "insert": {
      const added = Array.from({ length: edit.lines }, (_, i) => line(i));
      return {
        blocks: [...blocks.slice(0, at), ...added, ...blocks.slice(at)],
        change: { first: at, oldEnd: at, newEnd: at + edit.lines },
      };
    }
    case "delete": {
      const count = Math.min(edit.count, blocks.length - at - 1);
      return {
        blocks: [...blocks.slice(0, at), ...blocks.slice(at + count)],
        change: { first: at, oldEnd: at + count, newEnd: at },
      };
    }
    case "element": {
      const old = blocks[at]!;
      return {
        blocks: blocks.with(at, block(edit.type, old.text, { id: old.id })),
        change: { first: at, oldEnd: at + 1, newEnd: at + 1 },
      };
    }
  }
}

// Paginates a generated script, applies one edit at a block before a drawn anchor and repaginates with its hint.
const arbScriptAndEditAbove: fc.Arbitrary<EditAbove> = fc
  .record({
    seed: fc.integer({ min: 1, max: 50 }),
    count: fc.integer({ min: 120, max: 400 }),
    edit: fc.oneof(
      fc.record({
        kind: fc.constant("insert" as const),
        at: fc.nat(),
        lines: fc.integer({ min: 1, max: 30 }),
      }),
      fc.record({
        kind: fc.constant("delete" as const),
        at: fc.nat(),
        count: fc.integer({ min: 1, max: 12 }),
      }),
      fc.record({
        kind: fc.constant("element" as const),
        at: fc.nat(),
        type: fc.constantFrom(...ELEMENTS),
      }),
    ),
    anchor: fc.nat(),
  })
  .map(({ seed, count, edit, anchor }) => {
    const blocks = layoutBlocksOf(generateBlocks("screenplay", count, seed));
    const before = engine.paginate(blocks, sp);
    const next = applyEdit(blocks, edit);
    const after = engine.repaginate(before, next.blocks, next.change);
    const { newEnd } = next.change;
    const anchorAfter = newEnd + (anchor % (next.blocks.length - newEnd + 1));
    return {
      kind: edit.kind,
      before,
      after,
      change: next.change,
      anchorAfter,
      // a counter-example is shown as what drew it, not as two paginations
      [fc.toStringMethod]: () =>
        JSON.stringify({ seed, count, edit, change: next.change, anchorAfter }),
    };
  });

// each of the 200 runs paginates a script of up to 400 blocks from scratch, which takes seconds on a slow machine
test("an edit above the anchor moves it by exactly the height it added", () => {
  fc.assert(
    fc.property(
      arbScriptAndEditAbove,
      ({ before, after, change, anchorAfter }) => {
        const anchorBefore = anchorAfter - (change.newEnd - change.oldEnd);
        expect(anchorShiftPx(before, after, engine, change, anchorAfter)).toBe(
          blockTopPx(after, engine, 0, anchorAfter) -
            blockTopPx(before, engine, 0, anchorBefore),
        );
      },
    ),
    { numRuns: 200 },
  );
}, 20_000);

test("an edit at or below the anchor moves nothing", () => {
  const blocks = layoutBlocksOf(generateBlocks("screenplay", 200, 3));
  const before = engine.paginate(blocks, sp);
  const below = applyEdit(blocks, { kind: "insert", at: 40, lines: 5 });
  const covering = applyEdit(blocks, {
    kind: "element",
    at: 30,
    type: "dialogue",
  });
  expect([
    anchorShiftPx(
      before,
      engine.repaginate(before, below.blocks, below.change),
      engine,
      below.change,
      30,
    ),
    anchorShiftPx(
      before,
      engine.repaginate(before, covering.blocks, covering.change),
      engine,
      covering.change,
      30,
    ),
  ]).toEqual([0, 0]);
});

test("thirty lines added at the top of a 2,000-page script move the page by thirty lines and the breaks they push", () => {
  const blocks = layoutBlocksOf(generateBlocks("screenplay", 45_000, 1));
  const before = engine.paginate(blocks, sp);
  const edit = applyEdit(blocks, { kind: "insert", at: 0, lines: 30 });
  const after = engine.repaginate(before, edit.blocks, edit.change);
  const shift = anchorShiftPx(before, after, engine, edit.change, 40_030);
  const lineAndSpace = (1 + sp.elements.action.spaceBefore) * 2 * UNIT_PX;
  expect(before.pages.length).toBeGreaterThanOrEqual(2000);
  expect(shift).toBe(
    blockTopPx(after, engine, 0, 40_030) -
      blockTopPx(before, engine, 0, 40_000),
  );
  expect(shift).toBeGreaterThanOrEqual(30 * lineAndSpace);
}, 20_000);

test("from the first block to the last, with the first page's top and the last page's blank, the pages are filled exactly", () => {
  const { height, top, bottom } = screenPagePx(sp);
  for (const count of [40, 900, 3000]) {
    const p = engine.paginate(
      layoutBlocksOf(generateBlocks("screenplay", count, 7)),
      sp,
    );
    const pages = p.pages.length;
    expect(
      top +
        blockTopPx(p, engine, 0, count) +
        engine.fillUnits(p, pages - 1) * UNIT_PX +
        bottom,
    ).toBe(pages * height + (pages - 1) * PAGE_GAP_PX);
  }
});

test("a deletion that moves the page break above the reader moves the reader by exactly the height it took away", () => {
  const blocks = layoutBlocksOf(generateBlocks("screenplay", 290, 18));
  const before = engine.paginate(blocks, sp);
  const edit = applyEdit(blocks, { kind: "delete", at: 189, count: 3 });
  const after = engine.repaginate(before, edit.blocks, edit.change);
  expect(edit.change).toEqual({ first: 189, oldEnd: 192, newEnd: 189 });
  expect(anchorShiftPx(before, after, engine, edit.change, 189)).toBe(
    blockTopPx(after, engine, 0, 189) - blockTopPx(before, engine, 0, 192),
  );
});

test("a line added on a page with room at its foot leaves the block that opens the next page where it is", () => {
  const blocks = [
    ...Array.from({ length: 10 }, (_, i) => line(i + 1)),
    block("page_break", "", { id: "break" }),
    ...Array.from({ length: 60 }, (_, i) => line(i + 11)),
  ];
  const before = engine.paginate(blocks, sp);
  const edit = applyEdit(blocks, { kind: "insert", at: 3, lines: 1 });
  const after = engine.repaginate(before, edit.blocks, edit.change);
  expect([before.pages[1]!.block, after.pages[1]!.block]).toEqual([11, 12]);
  expect(anchorShiftPx(before, after, engine, edit.change, 12)).toBe(0);
});
