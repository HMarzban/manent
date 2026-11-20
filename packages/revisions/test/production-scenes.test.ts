import { expect, test } from "bun:test";
import fc from "fast-check";
import { DEFAULT_BLOCK_ATTRS } from "@manent/schema";
import type { BlockAttrs, FlatBlock } from "@manent/schema";
import {
  ENGINE_VERSION,
  applyLayoutPatches,
  engineFor,
} from "@manent/pagination";
import {
  NUMBERING_SCHEMES,
  compareSceneNumbers,
  deriveNumbers,
  lockNumbers,
  productionLayout,
} from "../src/index.ts";
import type { NumberingScheme } from "../src/index.ts";

type Block = Omit<FlatBlock, "section" | "index">;

function heading(id: string, attrs: Partial<BlockAttrs> = {}): Block {
  return {
    attrs: { ...DEFAULT_BLOCK_ATTRS, id, type: "scene_heading", ...attrs },
    runs: [],
  };
}

function action(id: string): Block {
  return { attrs: { ...DEFAULT_BLOCK_ATTRS, id }, runs: [] };
}

function flat(...blocks: Block[]): FlatBlock[] {
  return blocks.map((block, index) => ({ ...block, section: 0, index }));
}

const h = (blockId: string, num: string | null) => ({ blockId, num });
const derive = (
  list: ReturnType<typeof h>[],
  scheme: NumberingScheme,
  used: string[] = [],
) => Object.fromEntries(deriveNumbers(list, scheme, new Set(used)));

test("scene numbers sort as a schedule reads them", () => {
  expect(
    ["13", "12B", "A13", "12", "12AA", "A12", "12A"].toSorted(
      compareSceneNumbers,
    ),
  ).toEqual(["A12", "12", "12A", "12AA", "12B", "A13", "13"]);
});

test("scenes added after lock are lettered from their locked neighbours", () => {
  expect(
    derive(
      [h("a", "12"), h("n1", null), h("n2", null), h("b", "13")],
      "suffix",
    ),
  ).toEqual({ n1: "12A", n2: "12B" });
  expect(derive([h("a", "12"), h("n1", null), h("b", "13")], "prefix")).toEqual(
    { n1: "A13" },
  );
  expect(
    derive([h("a", "12A"), h("n1", null), h("b", "12B")], "suffix"),
  ).toEqual({ n1: "12AA" });
  expect(derive([h("n0", null), h("a", "1")], "suffix")).toEqual({ n0: "A1" });
  expect(derive([h("a", "50"), h("n1", null)], "prefix")).toEqual({
    n1: "50A",
  });
  // a reserved number is never given again
  expect(
    derive([h("a", "12"), h("n1", null), h("b", "13")], "suffix", ["12A"]),
  ).toEqual({ n1: "12B" });
});

test("a scene with no number left between its neighbours still gets one nobody holds", () => {
  expect(
    derive([h("a", "12"), h("n1", null), h("b", "12A")], "suffix"),
  ).toEqual({ n1: "12B" });
  expect(derive([h("a", "20"), h("n1", null), h("b", "13")], "prefix")).toEqual(
    { n1: "20A" },
  );
  expect(derive([h("n0", null), h("a", "A1")], "suffix")).toEqual({
    n0: "A1A",
  });
  expect(derive([h("n0", null), h("n1", null)], "suffix", ["1"])).toEqual({
    n0: "2",
    n1: "3",
  });
});

// Every gap of this list has room: between 2 and 2B, A5 and 5, 7 and 7B.
const LOCKED = ["1", "2", "2B", "3", "A5", "5", "7", "7B"];
const RESERVED = ["A1", "1A", "2A", "B5", "5A", "7C"];

/** The locked headings with new ones inserted before the locked heading at each index (8: at the end), in the order given. */
function merged(
  gaps: readonly number[],
): { blockId: string; num: string | null }[] {
  return [...LOCKED, null].flatMap((num, at) => [
    ...gaps.flatMap((gap, i) => (gap === at ? [h(`n${i}`, null)] : [])),
    ...(num === null ? [] : [h(`l${at}`, num)]),
  ]);
}

test("two writers' new scenes in one gap get different numbers wherever they merge", () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: LOCKED.length }), { maxLength: 6 }),
      fc.constantFrom(...NUMBERING_SCHEMES),
      fc.subarray(RESERVED),
      (gaps, scheme, used) => {
        const list = merged(gaps);
        const derived = deriveNumbers(list, scheme, new Set(used));
        expect([...derived.keys()]).toEqual(
          list.filter((x) => x.num === null).map((x) => x.blockId),
        );
        const shown = list.map((x) => x.num ?? derived.get(x.blockId)!);
        expect(shown.filter((num, i) => shown.indexOf(num) !== i)).toEqual([]);
        expect(
          [...derived.values()].filter((num) => used.includes(num)),
        ).toEqual([]);
        expect(shown).toEqual(shown.toSorted(compareSceneNumbers));
      },
    ),
    { numRuns: 200 },
  );
});

test("lock takes each heading's displayed number", () => {
  expect(
    lockNumbers(
      flat(
        heading("h1"),
        action("a"),
        heading("h2", { num: "7" }),
        heading("h3"),
      ),
    ),
  ).toEqual([
    { blockId: "h1", num: "1" },
    { blockId: "h2", num: "7" },
    { blockId: "h3", num: "3" },
  ]);
});

test("an omitted scene reads OMITTED with its number and takes no room", () => {
  const layout = productionLayout(
    flat(
      heading("h1", { num: "4", omitted: true }),
      action("a1"),
      heading("h2", { num: "5" }),
      heading("h3"),
    ),
    new Map([["h3", "5A"]]),
  );
  expect([...layout.patches]).toEqual([
    ["h1", { text: "OMITTED" }],
    ["a1", { type: "group", text: "" }],
    ["h3", { num: "5A" }],
  ]);
});

test("consecutive omitted scenes collapse to one line with their range", () => {
  const layout = productionLayout(
    flat(
      heading("h1", { num: "113", omitted: true }),
      action("a"),
      heading("h2", { num: "114", omitted: true }),
      heading("h3", { num: "121", omitted: true }),
      heading("h4", { num: "122" }),
    ),
    new Map(),
  );
  expect([...layout.patches]).toEqual([
    ["h1", { text: "OMITTED", num: "113–121" }],
    ["a", { type: "group", text: "" }],
    ["h2", { type: "group", text: "" }],
    ["h3", { type: "group", text: "" }],
  ]);
});

test("bringing back an omitted scene shows its blocks with the same number", () => {
  const omitted = flat(
    heading("h1", { num: "4", omitted: true }),
    action("a1"),
    heading("h2", { num: "5" }),
  );
  const back = flat(
    heading("h1", { num: "4" }),
    action("a1"),
    heading("h2", { num: "5" }),
  );
  const layout = productionLayout(back, new Map());
  expect([...layout.patches]).toEqual([]);
  expect(layout.key).not.toBe(productionLayout(omitted, new Map()).key);
  const blocks = engineFor(ENGINE_VERSION)!.toLayoutBlocks(back);
  const shown = applyLayoutPatches(blocks, layout);
  shown.forEach((block, i) => expect(block).toBe(blocks[i]!));
  expect(shown.map((block) => [block.id, block.num])).toEqual([
    ["h1", "4"],
    ["a1", null],
    ["h2", "5"],
  ]);
});
