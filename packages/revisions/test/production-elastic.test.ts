import { expect, test } from "bun:test";
import fc from "fast-check";
import { UNITS_PER_LINE, toLockTable } from "@manent/pagination";
import type {
  ChangeHint,
  LayoutBlock,
  LockAnchorRecord,
  LockSource,
  Pagination,
} from "@manent/pagination";
import {
  corpusId,
  filledBlock,
  filledText,
  generateBlocks,
  layoutBlocksOf,
} from "@manent/pagination/testing";
import type { BlockJSON } from "@manent/schema";
import {
  baseEngine,
  captureAnchors,
  elasticEngine,
  elasticPages,
  lockedPagination,
} from "../src/index.ts";
import { b } from "./history-docs.ts";
import { SCREENPLAY, labelsOf, layoutOf, v1 } from "./production-fixtures.ts";

const P1 = corpusId(1);
const P2 = corpusId(2);
const P3 = corpusId(3);
const CUE = corpusId(4);
const SPEECH = corpusId(5);

/** One line on page 1, then page 2's action, `over` lines longer than a page, then one line on page 3. */
function scriptOver(over: number): BlockJSON[] {
  return [
    b(P1, filledText(60, 1)),
    b(P2, filledText(60, SCREENPLAY.linesPerPage + over)),
    b(P3, filledText(60, 1)),
  ];
}

const SCRIPT_OVER_5 = scriptOver(5);

/** Page `labels[i]` starts at block `ids[i]`, offset 0. */
function recordsFor(
  labels: readonly string[],
  source: LockSource,
  ids: readonly string[] = [P1, P2, P3],
): LockAnchorRecord[] {
  return labels.map((label, i) => ({
    level: 1,
    order: i + 1,
    label,
    blockId: ids[i]!,
    offset: 0,
    quote: "",
    fallbackIds: [],
    source,
  }));
}

const paged = (
  blocks: readonly BlockJSON[],
  records: readonly LockAnchorRecord[],
): Pagination =>
  v1.paginate(layoutOf(blocks), SCREENPLAY, toLockTable(records));

// a script whose page 2 starts at an import anchor and holds `over` lines more than fit
const imported = (over: number, source: LockSource = "import") =>
  paged(scriptOver(over), recordsFor(["1", "2", "3"], source));

test("an imported page up to four lines over is drawn whole, and the pages after it move down", () => {
  const { pagination, overflowing } = elasticPages(imported(4));
  expect([
    pagination.pages.map((p) => p.label),
    pagination.pages.map((p) => p.index),
    overflowing,
  ]).toEqual([["1", "2", "3"], [0, 1, 2], []]);
  expect(pagination.pages[1]!.usedUnits).toBe(
    SCREENPLAY.linesPerPage * UNITS_PER_LINE + 4 * UNITS_PER_LINE,
  );
  // into the bottom margin
  expect(v1.layoutPage(pagination, 1).lines.at(-1)!.y).toBeGreaterThanOrEqual(
    SCREENPLAY.linesPerPage * UNITS_PER_LINE,
  );
});

test("an imported page five lines over keeps its A-page and is listed as overflowing", () => {
  const { pagination, overflowing } = elasticPages(imported(5));
  expect([pagination.pages.map((p) => p.label), overflowing]).toEqual([
    ["1", "2", "2A", "3"],
    ["2"],
  ]);
});

test("an imported page that runs onto two A-pages keeps both, however short the first", () => {
  const p = imported(2);
  const runOn = {
    ...p,
    pages: [
      ...p.pages.slice(0, 3),
      { ...p.pages[2]!, index: 3, label: "2B" },
      { ...p.pages[3]!, index: 4 },
    ],
  };
  expect(elasticPages(runOn)).toEqual({
    pagination: runOn,
    overflowing: ["2"],
  });
});

test("a lock or an issue anchor is never elastic", () => {
  for (const source of ["lock", "issue"] as const)
    expect(
      elasticPages(imported(2, source)).pagination.pages.map((p) => p.label),
    ).toEqual(["1", "2", "2A", "3"]);
});

test("a merged page ends as its overflow ended: a speech that runs on still says (MORE)", () => {
  // page 2 is full; its overflow holds a cue and two lines of a speech that page 3 starts inside
  const speech = [
    b(P1, filledText(60, 1)),
    b(P2, filledText(60, SCREENPLAY.linesPerPage)),
    b(CUE, "DANA", { type: "character" }),
    b(SPEECH, filledText(35, 4), { type: "dialogue" }),
  ];
  const records = recordsFor(["1", "2", "3"], "import", [P1, P2, SPEECH]);
  const before = paged(speech, records.with(2, { ...records[2]!, offset: 70 }));
  const { pagination } = elasticPages(before);
  const last = v1.layoutPage(pagination, 1).lines.at(-1)!;
  expect([
    before.pages.map((p) => [p.label, p.more]),
    pagination.pages.map((p) => [p.label, p.more]),
    [last.kind, last.runs.map((run) => run.text).join("")],
  ]).toEqual([
    [
      ["1", false],
      ["2", false],
      ["2A", true],
      ["3", false],
    ],
    [
      ["1", false],
      ["2", true],
      ["3", false],
    ],
    ["more", "(MORE)"],
  ]);
});

test("a merged page holds its overflow's lines without the cue repeated above them, and says no (MORE) between", () => {
  // page 2 ends inside a speech that its overflow, below the repeated cue, finishes
  const speech = [
    b(P1, filledText(60, 1)),
    b(P2, filledText(60, SCREENPLAY.linesPerPage - 6)),
    b(CUE, "DANA", { type: "character" }),
    b(SPEECH, filledText(35, 6), { type: "dialogue" }),
    b(P3, filledText(60, 1)),
  ];
  const before = paged(speech, recordsFor(["1", "2", "3"], "import"));
  const { pagination } = elasticPages(before);
  const kinds = new Set(
    v1.layoutPage(pagination, 1).lines.map((line) => line.kind),
  );
  expect([
    before.pages.map((p) => [p.label, p.topUnits, p.usedUnits, p.more]),
    pagination.pages.map((p) => [p.label, p.topUnits, p.usedUnits, p.more]),
    [...kinds].toSorted(),
  ]).toEqual([
    [
      ["1", 0, 2, false],
      ["2", 0, 108, true],
      ["2A", 2, 8, false],
      ["3", 0, 2, false],
    ],
    [
      ["1", 0, 2, false],
      ["2", 0, 114, false],
      ["3", 0, 2, false],
    ],
    ["page_number", "text"],
  ]);
});

test("a pagination with no import anchor is returned as it is", () => {
  const p = imported(2, "lock");
  expect(elasticPages(p).pagination).toBe(p);
});

test("the rule applied twice gives what it gave once", () => {
  for (const over of [2, 4, 5]) {
    const once = elasticPages(imported(over));
    const twice = elasticPages(once.pagination);
    expect([twice.pagination.pages, twice.overflowing]).toEqual([
      once.pagination.pages,
      once.overflowing,
    ]);
  }
});

test("lockedPagination applies the rule and says which imported pages overflow", () => {
  const layout = lockedPagination(
    layoutOf(SCRIPT_OVER_5),
    SCREENPLAY,
    recordsFor(["1", "2", "3"], "import"),
    v1,
  );
  expect([labelsOf(layout), layout.overflowing]).toEqual([
    ["1", "2", "2A", "3"],
    ["2"],
  ]);
});

test("lockedPagination draws an imported page four lines over whole", () => {
  const layout = lockedPagination(
    layoutOf(scriptOver(4)),
    SCREENPLAY,
    recordsFor(["1", "2", "3"], "import"),
    v1,
  );
  expect([labelsOf(layout), layout.overflowing]).toEqual([["1", "2", "3"], []]);
});

const PLAIN: LayoutBlock[] = layoutBlocksOf(
  generateBlocks("screenplay", 160, 3),
);
const PLAIN_PAGES = v1.paginate(PLAIN, SCREENPLAY);
/** Every page of the generated script started by an import anchor. */
const LOCKS = toLockTable(
  captureAnchors(PLAIN_PAGES, "every_page", 1, "import"),
);

const grown = (blocks: readonly LayoutBlock[], page: number, id: string) =>
  blocks.toSpliced(
    PLAIN_PAGES.pages[page]!.block + 1,
    0,
    filledBlock("action", 5, { id }),
  );

/** Five lines added to page 5, which is drawn whole, and to page 2, which keeps an A-page. */
const BLOCKS = grown(grown(PLAIN, 4, "grown5"), 1, "grown2");

type Edit =
  | { readonly kind: "insert"; readonly at: number; readonly lines: number }
  | { readonly kind: "delete"; readonly at: number }
  | { readonly kind: "retype"; readonly at: number; readonly pos: number };

// Inserted actions of one to seven lines push a page one to seven lines over: merged, or kept on an A-page.
const arbitraryEdit: fc.Arbitrary<Edit> = fc.oneof(
  fc.record({
    kind: fc.constant("insert" as const),
    at: fc.nat(),
    lines: fc.integer({ min: 1, max: 7 }),
  }),
  fc.record({ kind: fc.constant("delete" as const), at: fc.nat() }),
  fc.record({
    kind: fc.constant("retype" as const),
    at: fc.nat(),
    pos: fc.nat(),
  }),
);

function applyEdit(
  blocks: readonly LayoutBlock[],
  edit: Edit,
): { blocks: LayoutBlock[]; change: ChangeHint } {
  switch (edit.kind) {
    case "insert": {
      const at = edit.at % (blocks.length + 1);
      return {
        blocks: blocks.toSpliced(
          at,
          0,
          filledBlock("action", edit.lines, { id: "inserted" }),
        ),
        change: { first: at, oldEnd: at, newEnd: at + 1 },
      };
    }
    case "delete": {
      const at = edit.at % blocks.length;
      return {
        blocks: blocks.toSpliced(at, 1),
        change: { first: at, oldEnd: at + 1, newEnd: at },
      };
    }
    case "retype": {
      const at = edit.at % blocks.length;
      const { text } = blocks[at]!;
      const pos = edit.pos % (text.length + 1);
      const typed = text.slice(0, pos) + "x".repeat(40) + text.slice(pos);
      return {
        blocks: blocks.with(at, Object.freeze({ ...blocks[at]!, text: typed })),
        change: { first: at, oldEnd: at + 1, newEnd: at + 1 },
      };
    }
  }
}

test("the elastic engine repaginates as it paginates", () => {
  fc.assert(
    fc.property(arbitraryEdit, (edit) => {
      const engine = elasticEngine(v1);
      const before = engine.paginate(BLOCKS, SCREENPLAY, LOCKS);
      const { blocks, change } = applyEdit(BLOCKS, edit);
      expect(engine.repaginate(before, blocks, change).pages).toEqual(
        engine.paginate(blocks, SCREENPLAY, LOCKS).pages,
      );
    }),
    { numRuns: 100 },
  );
}, 30_000);

test("the elastic engine given nothing changed answers the pages it was given", () => {
  const engine = elasticEngine(v1);
  const before = engine.paginate(BLOCKS, SCREENPLAY, LOCKS);
  expect(engine.repaginate(before, BLOCKS)).toBe(before);
});

test("the elastic engine wraps once and unwraps to the engine it wrapped", () => {
  const e = elasticEngine(v1);
  expect([
    elasticEngine(e) === e,
    baseEngine(e) === v1,
    baseEngine(v1) === v1,
    e.version,
  ]).toEqual([true, true, true, 1]);
});
