import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  lineStartsOf,
  paginate,
  profileFor,
  toLayoutBlocks,
} from "@manent/pagination";
import type { PageProfile, Pagination } from "@manent/pagination";
import { block } from "@manent/pagination/testing";
import { blocksOf } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import {
  baselineOf,
  blockMarkedLines,
  compareDocs,
  contentHash,
  issueBlocks,
  issuedMarks,
  liveMarks,
  markBlock,
  overrideKey,
  pageRevision,
  parseOverride,
  removedMarks,
  revisedPages,
} from "../src/index.ts";
import type {
  BlockChange,
  MarkMode,
  Override,
  PageRevision,
  RevisionSource,
  SetBlockRecord,
} from "../src/index.ts";
import {
  A,
  B,
  C,
  D,
  E,
  H1,
  H2,
  N,
  X,
  b,
  blockJSONs,
  doc,
} from "./history-docs.ts";

const SCREENPLAY: PageProfile = profileFor("screenplay")!;

interface Facts {
  baseVisible: boolean;
  visible: boolean;
  moved: boolean;
  override: Override | null;
}

function facts(over: Partial<Facts> = {}): Facts {
  return {
    baseVisible: true,
    visible: true,
    moved: false,
    override: null,
    ...over,
  };
}

function h(id: string, attrs: Record<string, unknown>): BlockJSON {
  return b(id, "INT. HOUSE - DAY", { type: "scene_heading", ...attrs });
}

function paginateDoc(d: DocJSON): Pagination {
  return paginate(toLayoutBlocks(blocksOf(d)), SCREENPLAY);
}

function movedIds(older: DocJSON, newer: DocJSON): Set<string> {
  return new Set(
    compareDocs(older, newer)
      .entries.filter((entry) => entry.moved)
      .map((entry) => entry.id),
  );
}

const FERRY =
  "The ferry leaves the pier at dusk and the gulls follow it out past the breakwater while the deckhands coil the wet ropes and the passengers stand at the rail watching the lights go small.";
const FERRY_STERN = FERRY.replace("rail", "stern");
// the line starts of FERRY_STERN, read once from a run so that the fixture itself is pinned
const FERRY_STERN_LINE_STARTS = [0, 58, 115, 172];

test("a changed word marks the lines it is on and no others", () => {
  const p = paginateDoc(doc(b(A, FERRY_STERN)));
  expect([...lineStartsOf(p, 0)]).toEqual(FERRY_STERN_LINE_STARTS);
  const mark = markBlock(b(A, FERRY), b(A, FERRY_STERN), facts());
  expect(mark).toEqual({
    kind: "ranges",
    inserted: [[153, 158]],
    deletedAt: [153],
  });
  expect(blockMarkedLines(p, 0, mark!)).toEqual([2]);
});

test("a mark covers the lines its ranges touch, and a deletion where a line starts marks the line it ends", () => {
  const p = paginateDoc(doc(b(A, FERRY_STERN)));
  const ranges = (inserted: [number, number][], deletedAt: number[]) =>
    blockMarkedLines(p, 0, { kind: "ranges", inserted, deletedAt });
  expect([
    ranges([[100, 120]], []),
    ranges([[57, 58]], []),
    ranges([[58, 59]], []),
    ranges([], [0, 58]),
    ranges([], [59, 186]),
    blockMarkedLines(p, 0, { kind: "whole" }),
  ]).toEqual([[1, 2], [0], [1], [0], [1, 3], [0, 1, 2, 3]]);
});

test("a scene number written at issue marks nothing", () => {
  expect(
    markBlock(h("h1", { num: null }), h("h1", { num: "4A" }), facts()),
  ).toBeNull();
});

test("typing then deleting leaves no mark", () => {
  expect(markBlock(b("a", "Rain."), b("a", "Rain."), facts())).toBeNull();
});

test("a deleted line is marked at the deletion point", () => {
  const mark = markBlock(b(A, "one two three"), b(A, "one three"), facts());
  expect(mark).toEqual({ kind: "ranges", inserted: [], deletedAt: [5] });
  expect(
    blockMarkedLines(paginateDoc(doc(b(A, "one three"))), 0, mark!),
  ).toEqual([0]);
  const rain = b(A, "Rain.");
  const horn = b(B, "A horn sounds.");
  const silence = b(C, "Silence.");
  expect([
    removedMarks(
      baselineOf([rain, horn, silence]),
      blocksOf(doc(rain, silence)),
      [B],
    ),
    removedMarks(baselineOf([rain, horn]), blocksOf(doc(rain)), [B]),
    removedMarks(
      baselineOf([rain, horn, h(H1, { omitted: true }), silence]),
      blocksOf(doc(rain, h(H1, { omitted: true }), silence)),
      [B],
    ),
  ]).toEqual([
    new Map([[C, { kind: "ranges", inserted: [], deletedAt: [0] }]]),
    new Map([[A, { kind: "ranges", inserted: [], deletedAt: [5] }]]),
    new Map([[A, { kind: "ranges", inserted: [], deletedAt: [5] }]]),
  ]);
});

test("an added, moved, omitted or brought-back block is marked whole", () => {
  expect([
    markBlock(null, b("n", "x"), facts()),
    markBlock(b("a", "x"), b("a", "x"), facts({ moved: true })),
    markBlock(
      b("a", "x"),
      b("a", "x"),
      facts({ baseVisible: false, visible: true }),
    ),
    markBlock(
      b("a", "x"),
      b("a", "x"),
      facts({ baseVisible: true, visible: false }),
    ),
  ]).toEqual([
    { kind: "whole" },
    { kind: "whole" },
    { kind: "whole" },
    { kind: "whole" },
  ]);
});

test("an element change or a mark by hand marks the block whole", () => {
  expect([
    markBlock(b("a", "Dana."), b("a", "Dana.", { type: "character" }), facts()),
    markBlock(
      b("a", "Rain."),
      b("a", "Rain."),
      facts({ override: { kind: "marked" } }),
    ),
  ]).toEqual([{ kind: "whole" }, { kind: "whole" }]);
});

test("a block cleared by hand becomes revised again when its text changes", () => {
  const cleared = {
    kind: "cleared",
    hash: contentHash(b("a", "Rain hard.")),
  } as const;
  expect([
    markBlock(
      b("a", "Rain."),
      b("a", "Rain hard."),
      facts({ override: cleared }),
    ),
    markBlock(
      b("a", "Rain."),
      b("a", "Rain harder."),
      facts({ override: cleared }),
    ),
  ]).toEqual([null, { kind: "ranges", inserted: [[4, 11]], deletedAt: [] }]);
});

test("a block's content hash leaves out its id, its number and whether it is omitted", () => {
  expect([
    contentHash(b(A, "Rain.")),
    contentHash(b(B, "Rain.", { num: "4", omitted: true })),
    contentHash(b(A, "Nuit étoilée 🎬")),
    contentHash(b(A, "Rain.", { type: "character" })),
  ]).toEqual(["99f6a0af", "99f6a0af", "f2f216e9", "581c8030"]);
});

test("an override reads back only in its two forms", () => {
  expect(
    ["marked", "cleared@0a1b2c3d", "cleared@zz", "cleared", 7].map(
      parseOverride,
    ),
  ).toEqual([
    { kind: "marked" },
    { kind: "cleared", hash: "0a1b2c3d" },
    null,
    null,
    null,
  ]);
  expect(overrideKey("s2", "b9")).toBe("s2:b9");
});

// Page 1 holds rain; page 2 dust and wind; page 3 calm.
const PAGES = paginate(
  [
    block("action", "Rain falls.", { id: "rain" }),
    block("page_break", "", { id: "break1" }),
    block("action", "Dust.", { id: "dust" }),
    block("action", "Wind.", { id: "wind" }),
    block("page_break", "", { id: "break2" }),
    block("action", "Calm.", { id: "calm" }),
  ],
  SCREENPLAY,
);

function source(over: Partial<RevisionSource>): RevisionSource {
  return {
    ordinal: 1,
    name: "Blue",
    colour: "blue",
    mark: "*",
    day: "2026-11-16",
    fullDraft: false,
    marks: new Map(),
    ...over,
  };
}

const BLUE = source({
  marks: new Map([
    ["rain", { kind: "whole" }],
    ["dust", { kind: "whole" }],
  ]),
});
const PINK = source({
  ordinal: 2,
  name: "Pink",
  colour: "pink",
  mark: "+",
  day: "2026-11-17",
  marks: new Map([["wind", { kind: "whole" }]]),
});
const BLUE_PAGE: PageRevision = {
  colour: "blue",
  name: "Blue",
  header: "Blue Rev. (16 Nov 2026)",
  marks: [{ y: 0, text: "*" }],
};
const PINK_PAGE: PageRevision = {
  colour: "pink",
  name: "Pink",
  header: "Pink Rev. (17 Nov 2026)",
  marks: [{ y: 4, text: "+" }],
};

test("a page takes the colour of the latest revision that revised it", () => {
  expect(
    [0, 1, 2].map((page) =>
      pageRevision(PAGES, page, [BLUE, PINK], "collated"),
    ),
  ).toEqual([BLUE_PAGE, PINK_PAGE, null]);
});

function firstTwoPages(
  mode: MarkMode,
  sources: readonly RevisionSource[],
): (PageRevision | null)[] {
  return [0, 1].map((page) => pageRevision(PAGES, page, sources, mode));
}

test("each display mode admits its revisions", () => {
  const fullBlue = { ...BLUE, fullDraft: true };
  expect([
    firstTwoPages("collated", [BLUE, PINK]),
    firstTwoPages("all", [BLUE, PINK]),
    firstTwoPages("this_revision", [BLUE, PINK]),
    firstTwoPages("since_full_draft", [fullBlue, PINK]),
    firstTwoPages("since_full_draft", [BLUE, PINK]),
    firstTwoPages("none", [BLUE, PINK]),
  ]).toEqual([
    [BLUE_PAGE, PINK_PAGE],
    [
      BLUE_PAGE,
      {
        ...PINK_PAGE,
        marks: [
          { y: 0, text: "*" },
          { y: 4, text: "+" },
        ],
      },
    ],
    [null, PINK_PAGE],
    [null, PINK_PAGE],
    [
      BLUE_PAGE,
      {
        ...PINK_PAGE,
        marks: [
          { y: 0, text: "*" },
          { y: 4, text: "+" },
        ],
      },
    ],
    [null, null],
  ]);
});

test("the revised pages are those holding a marked line, in page order", () => {
  expect([
    revisedPages(PAGES, BLUE.marks),
    revisedPages(PAGES, PINK.marks),
    revisedPages(PAGES, new Map()),
  ]).toEqual([["1", "2"], ["2"], []]);
});

// Dust moves up, Rain gains a word, the horn goes, Thunder is new and the omitted second scene comes back after a page break.
const BASELINE = doc(
  h(H1, { num: "1" }),
  b(A, "Rain."),
  b(B, "A horn sounds."),
  b(C, "Silence."),
  b(D, "Dust."),
  b(X, "", { type: "page_break" }),
  h(H2, { num: "2", omitted: true }),
  b(E, "Wind."),
);
const ISSUED = doc(
  h(H1, { num: "1" }),
  b(D, "Dust."),
  b(A, "Rain hard."),
  b(C, "Silence."),
  b(N, "Thunder."),
  b(X, "", { type: "page_break" }),
  h(H2, { num: "2" }),
  b(E, "Wind."),
);

test("the live marks of a script are its changed blocks and its deletion points", () => {
  expect(
    liveMarks(
      baselineOf(blockJSONs(BASELINE)),
      blocksOf(ISSUED),
      movedIds(BASELINE, ISSUED),
      () => null,
    ),
  ).toEqual(
    new Map([
      [D, { kind: "whole" }],
      [A, { kind: "ranges", inserted: [[4, 9]], deletedAt: [] }],
      [C, { kind: "ranges", inserted: [], deletedAt: [0] }],
      [N, { kind: "whole" }],
      [H2, { kind: "whole" }],
      [E, { kind: "whole" }],
    ]),
  );
});

function record(
  blockId: string,
  pageLabel: string,
  change: BlockChange,
  of: BlockJSON,
  ranges: [number, number][] = [],
): SetBlockRecord {
  return {
    blockId,
    pageLabel,
    change,
    hash: contentHash(of),
    inserted: ranges,
    deletedAt: [],
  };
}

function markedByHand(id: string): Override | null {
  return id === C ? { kind: "marked" } : null;
}

test("an issue records each marked block, what became of it and the page its first marked line is on", () => {
  expect(
    issueBlocks(BASELINE, ISSUED, paginateDoc(ISSUED), markedByHand),
  ).toEqual([
    record(D, "1", "moved", b(D, "Dust.")),
    record(A, "1", "changed", b(A, "Rain hard."), [[4, 9]]),
    record(B, "1", "removed", b(B, "A horn sounds.")),
    record(C, "1", "changed", b(C, "Silence.")),
    record(N, "1", "added", b(N, "Thunder.")),
    record(H2, "2", "shown", h(H2, { num: "2" })),
    record(E, "2", "shown", b(E, "Wind.")),
  ]);
});

test("an issued revision's marks come back where its blocks are unchanged", () => {
  expect(
    issuedMarks(
      [
        record(A, "1", "changed", b(A, "Rain hard."), [[4, 9]]),
        record(B, "1", "changed", b(B, "Wind."), [[0, 5]]),
        record(C, "1", "changed", b(C, "Calm.")),
      ],
      new Map([
        [A, b(A, "Rain hard.")],
        [B, b(B, "Wind howls.")],
        [C, b(C, "Calm.")],
      ]),
    ),
  ).toEqual(
    new Map([
      [A, { kind: "ranges", inserted: [[4, 9]], deletedAt: [] }],
      [B, { kind: "whole" }],
      [C, { kind: "whole" }],
    ]),
  );
});

// The property's scripts: lines of a few elements, headings sometimes omitted, edited by insert, delete and retype.
interface Line {
  readonly id: string;
  readonly type: string;
  readonly omitted: boolean;
  readonly text: string;
}

type Edit =
  | { readonly kind: "insert"; readonly at: number; readonly text: string }
  | { readonly kind: "delete"; readonly at: number }
  | { readonly kind: "retype"; readonly at: number; readonly text: string };

const ELEMENTS = ["scene_heading", "action", "character", "dialogue"] as const;
const TEXTS = [
  "Rain.",
  "The door opens and Dana steps in out of the storm, shaking water from her coat.",
  "DANA",
  "We wait.",
  "Silence, then a knock at the window.",
];

const arbLine = fc.record({
  type: fc.constantFrom(...ELEMENTS),
  omitted: fc.oneof(
    { arbitrary: fc.constant(false), weight: 5 },
    { arbitrary: fc.constant(true), weight: 1 },
  ),
  text: fc.constantFrom(...TEXTS),
});
const arbText = fc.oneof(
  fc.constantFrom(...TEXTS),
  fc.constantFrom(...TEXTS).map((text) => `${text} Again.`),
);
const arbEdit: fc.Arbitrary<Edit> = fc.oneof(
  fc.record({
    kind: fc.constant("insert"),
    at: fc.nat({ max: 40 }),
    text: arbText,
  }),
  fc.record({ kind: fc.constant("delete"), at: fc.nat({ max: 40 }) }),
  fc.record({
    kind: fc.constant("retype"),
    at: fc.nat({ max: 40 }),
    text: arbText,
  }),
);

function scriptOf(lines: readonly Line[]): DocJSON {
  return doc(
    ...lines.map((line) =>
      b(
        line.id,
        line.text,
        line.type === "scene_heading"
          ? { type: line.type, omitted: line.omitted }
          : { type: line.type },
      ),
    ),
  );
}

function withLine(
  lines: readonly Line[],
  at: number,
  line: Line | null,
): Line[] {
  return [
    ...lines.slice(0, at),
    ...(line === null ? [] : [line]),
    ...lines.slice(at + 1),
  ];
}

function insertedAt(lines: readonly Line[], at: number, line: Line): Line[] {
  return [...lines.slice(0, at), line, ...lines.slice(at)];
}

function retyped(lines: readonly Line[], at: number, text: string): Line[] {
  return withLine(lines, at, { ...lines[at]!, text });
}

function newLine(k: number, text: string): Line {
  return {
    id: `n${String(k).padStart(15, "0")}`,
    type: "action",
    omitted: false,
    text,
  };
}

/** The edits applied as given. */
function direct(base: readonly Line[], edits: readonly Edit[]): Line[] {
  return edits.reduce<Line[]>(
    (lines, edit, k) => {
      if (edit.kind === "insert")
        return insertedAt(
          lines,
          edit.at % (lines.length + 1),
          newLine(k, edit.text),
        );
      if (lines.length === 0) return lines;
      const at = edit.at % lines.length;
      return edit.kind === "delete"
        ? withLine(lines, at, null)
        : retyped(lines, at, edit.text);
    },
    [...base],
  );
}

/** The same edits by a longer way: text typed and taken out again before each lands. */
function roundabout(base: readonly Line[], edits: readonly Edit[]): Line[] {
  return edits.reduce<Line[]>(
    (lines, edit, k) => {
      if (edit.kind === "insert") {
        const at = edit.at % (lines.length + 1);
        return retyped(
          insertedAt(lines, at, newLine(k, "Draft.")),
          at,
          edit.text,
        );
      }
      if (lines.length === 0) return lines;
      const at = edit.at % lines.length;
      const typed = retyped(lines, at, `${lines[at]!.text} more`);
      return edit.kind === "delete"
        ? withLine(typed, at, null)
        : retyped(retyped(typed, at, lines[at]!.text), at, edit.text);
    },
    [...base],
  );
}

function asterisks(baseline: DocJSON, current: DocJSON) {
  const marks = liveMarks(
    baselineOf(blockJSONs(baseline)),
    blocksOf(current),
    movedIds(baseline, current),
    () => null,
  );
  const p = paginateDoc(current);
  const sources = [source({ marks })];
  return {
    marks,
    pages: p.pages.map((page) =>
      pageRevision(p, page.index, sources, "collated"),
    ),
  };
}

test("asterisks depend only on the baseline and the current text", () => {
  fc.assert(
    fc.property(
      fc.array(arbLine, { minLength: 30, maxLength: 30 }),
      fc.array(arbEdit, { maxLength: 8 }),
      (drafts, edits) => {
        const base = drafts.map((draft, i) => ({
          ...draft,
          id: `s${String(i).padStart(15, "0")}`,
        }));
        const baseline = scriptOf(base);
        const one = scriptOf(direct(base, edits));
        const other = scriptOf(roundabout(base, edits));
        expect(other).toEqual(one);
        expect(asterisks(baseline, other)).toEqual(asterisks(baseline, one));
      },
    ),
    { numRuns: 200 },
  );
});
