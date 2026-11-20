import { expect, test } from "bun:test";
import { applyLayoutPatches, engineFor } from "@manent/pagination";
import type { LockAnchorRecord } from "@manent/pagination";
import { filledBlock, filledText } from "@manent/pagination/testing";
import {
  DEFAULT_BLOCK_ATTRS,
  canonicalBlock,
  sectionize,
} from "@manent/schema";
import type { BlockAttrs, BlockJSON, DocJSON, FlatBlock } from "@manent/schema";
import {
  captureAnchors,
  correctedBaseline,
  layoutImpact,
  lockNumbers,
  lockedPagination,
  mergeAnchors,
  productionChecks,
  productionLayout,
} from "../src/index.ts";
import type { SceneNumberRecord } from "../src/index.ts";

const v1 = engineFor(1)!;
const sp = v1.profileFor("screenplay")!;

type Block = Omit<FlatBlock, "section" | "index">;

function heading(n: number, attrs: Partial<BlockAttrs> = {}): Block {
  return {
    attrs: {
      ...DEFAULT_BLOCK_ATTRS,
      id: `h${n}`,
      type: "scene_heading",
      num: String(n),
      ...attrs,
    },
    runs: [{ text: `INT. ROOM ${n} - DAY`, marks: [] }],
  };
}

function action(id: string, lines: number): Block {
  return {
    attrs: { ...DEFAULT_BLOCK_ATTRS, id },
    runs: [{ text: filledText(60, lines), marks: [] }],
  };
}

function flat(blocks: readonly Block[]): FlatBlock[] {
  return blocks.map((block, index) => ({ ...block, section: 0, index }));
}

// Scene n fills one page: its heading and an action of 50 lines.
const scenes = (from: number, to: number): Block[] =>
  Array.from({ length: to - from + 1 }, (_, i) => [
    heading(from + i),
    action(`a${from + i}`, 50),
  ]).flat();

const layoutOf = (blocks: readonly Block[], records: LockAnchorRecord[]) => {
  const f = flat(blocks);
  return lockedPagination(
    applyLayoutPatches(v1.toLayoutBlocks(f), productionLayout(f, new Map())),
    sp,
    records,
    v1,
  );
};

function lock(blocks: readonly Block[]): {
  records: LockAnchorRecord[];
  issued: SceneNumberRecord[];
} {
  const f = flat(blocks);
  return {
    records: captureAnchors(
      v1.paginate(v1.toLayoutBlocks(f), sp),
      "every_page",
      1,
      "lock",
    ),
    issued: lockNumbers(f).map((n) => ({ ...n, reserved: false })),
  };
}

const checksOf = (
  blocks: readonly Block[],
  records: LockAnchorRecord[],
  issued: SceneNumberRecord[],
) =>
  productionChecks({
    flat: flat(blocks),
    layout: layoutOf(blocks, records),
    records,
    issued,
  });

const base = scenes(1, 42);
const locked = lock(base);
const clean = {
  flat: flat(base),
  layout: layoutOf(base, locked.records),
  records: locked.records,
  issued: locked.issued,
};

// Scene 40 grew to four pages and was issued, then 40A to 40C shrank; scene 17 grew past its page; scene 34 was omitted.
const grownAt40 = (lines: number) =>
  base.toSpliced(
    80,
    0,
    action("b40", lines),
    action("c40", lines),
    action("d40", lines),
  );
const issuedP = layoutOf(grownAt40(50), locked.records).pagination;
const afterIssue = mergeAnchors(
  locked.records,
  captureAnchors(issuedP, "derived_pages", 1, "issue"),
  issuedP,
);
const messyBlocks = grownAt40(10)
  .with(33, action("a17", 60))
  .with(66, heading(34, { omitted: true }));
const messy = {
  flat: flat(messyBlocks),
  layout: layoutOf(messyBlocks, afterIssue),
  records: afterIssue,
  issued: locked.issued,
};

test("a clean script passes the two production checks", () => {
  expect(productionChecks(clean)).toEqual([
    { kind: "numbers_unchanged", ok: true },
    { kind: "pages_intact", ok: true },
  ]);
});

test("an overflowing page, fragments and omitted scenes are listed", () => {
  expect(productionChecks(messy).filter((c) => !c.ok)).toEqual([
    { kind: "overflow", ok: false, page: "17", next: "17A" },
    {
      kind: "fragments",
      ok: false,
      first: "40A",
      last: "40C",
      labels: ["40A", "40B", "40C"],
    },
    { kind: "omitted", ok: false, scenes: ["34"] },
  ]);
});

test("a moved scene shows as locked pages out of place", () => {
  // Scene 12 fills pages 12 and 13; scene n fills page n + 1 after it.
  const script = [
    ...scenes(1, 11),
    heading(12),
    action("a12", 50),
    action("b12", 50),
    ...scenes(13, 31),
  ];
  const { records, issued } = lock(script);
  const moved = [
    ...script.slice(0, 22),
    ...script.slice(25, 59),
    ...script.slice(22, 25),
    ...script.slice(59),
  ];
  expect(checksOf(moved, records, issued)).toEqual([
    { kind: "numbers_unchanged", ok: true },
    { kind: "pages_moved", ok: false, pages: ["12", "13"] },
    { kind: "overflow", ok: false, page: "30", next: "30A" },
  ]);
});

test("an issued scene number missing, doubled or changed is listed", () => {
  // Scene 2's heading deleted, scene 5 numbered 4 as scene 4 is, scene 10 numbered 10A.
  const edited = base
    .toSpliced(2, 1)
    .with(7, heading(5, { num: "4" }))
    .with(17, heading(10, { num: "10A" }));
  expect(checksOf(edited, locked.records, locked.issued)).toEqual([
    {
      kind: "numbers_changed",
      ok: false,
      scenes: ["2", "4", "5", "10", "10A"],
    },
    { kind: "pages_intact", ok: true },
  ]);
});

test("emptied locked pages are listed and print as a range", () => {
  const emptied = base.toSpliced(24, 4);
  const checks = checksOf(emptied, locked.records, locked.issued);
  expect([
    checks,
    layoutOf(emptied, locked.records).pagination.pages[12]!.label,
  ]).toEqual([
    [
      { kind: "numbers_changed", ok: false, scenes: ["13", "14"] },
      { kind: "pages_intact", ok: true },
      { kind: "empty_page", ok: false, page: "13" },
      { kind: "empty_page", ok: false, page: "14" },
    ],
    "13–15",
  ]);
});

test("a page added before locked page 1 is listed as page 1's overflow", () => {
  const script = scenes(1, 3);
  const { records, issued } = lock(script);
  expect(
    checksOf([action("cold", 50), ...script], records, issued).filter(
      (c) => !c.ok,
    ),
  ).toEqual([{ kind: "overflow", ok: false, page: "1", next: "A1" }]);
});

test("Letter to A4 says how many pages would fall short first", () => {
  const blocks120 = Array.from({ length: 120 }, (_, i) =>
    filledBlock("action", 50, { id: `p${i + 1}` }),
  );
  const records120 = captureAnchors(
    v1.paginate(blocks120, sp),
    "every_page",
    1,
    "lock",
  );
  const r = layoutImpact(
    blocks120,
    v1.profileFor("screenplay")!,
    v1.profileFor("screenplay", { paper: "a4" })!,
    records120,
    v1,
  );
  expect([r.gainAPages, r.fallShort.length > 100]).toEqual([[], true]);
});

test("a layout change says which locked pages gain A-pages and which end early", () => {
  const blocks = [
    filledBlock("action", 50, { id: "p1" }),
    filledBlock("page_break", 0),
    filledBlock("action", 50, { id: "p2" }),
    filledBlock("page_break", 0),
    filledBlock("action", 53, { id: "p3" }),
  ];
  const records = captureAnchors(
    v1.paginate(blocks, sp),
    "every_page",
    1,
    "lock",
  );
  const r = layoutImpact(
    blocks,
    sp,
    v1.profileFor("screenplay", { linesPerPage: 51 })!,
    records,
    v1,
  );
  expect(r).toEqual({ gainAPages: ["3"], fallShort: [] });
});

const text = (id: string, words: string): BlockJSON =>
  canonicalBlock({
    type: "block",
    attrs: { id, type: "action" },
    content: [{ type: "text", text: words }],
  });
const docOf = (...blocks: BlockJSON[]): DocJSON => sectionize(blocks);

test("a correction moves only the chosen pages into the corrected revision", () => {
  const issued = docOf(
    text("p8", "Rain on the window."),
    text("p9a", "She opens the door."),
    text("p9b", "He waits."),
    text("p21a", "The train leaves."),
    text("p21b", "Nobody waves."),
  );
  const current = docOf(
    text("p8", "Rain on the window."),
    text("p9a", "She opens the door slowly."),
    text("p9c", "A bell rings."),
    text("p21a", "The train leaves early."),
    text("p21c", "Steam fills the platform."),
    text("p21b", "Nobody waves."),
  );
  const pages: Record<string, string> = {
    p8: "8",
    p9a: "9",
    p9b: "9",
    p9c: "9",
    p21a: "21",
    p21b: "21",
    p21c: "21",
  };
  expect(
    correctedBaseline(
      issued,
      current,
      (id) => pages[id] ?? null,
      new Set(["9"]),
    ),
  ).toEqual(
    docOf(
      text("p8", "Rain on the window."),
      text("p9a", "She opens the door slowly."),
      text("p9c", "A bell rings."),
      text("p21a", "The train leaves."),
      text("p21b", "Nobody waves."),
    ),
  );
});
