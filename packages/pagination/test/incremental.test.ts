import { expect, test } from "bun:test";
import { contdSuffix, paginate, profileFor, repaginate } from "../src/index.ts";
import type { LayoutBlock, LockAnchor } from "../src/index.ts";
import {
  cueBlock,
  filledBlock,
  filledText,
  generateBlocks,
  layoutBlocksOf,
} from "../src/testing/index.ts";

const sp = profileFor("screenplay")!;
const A = (n: number) => filledBlock("action", n);
const corpus = () => layoutBlocksOf(generateBlocks("screenplay", 3000, 1));
const edit = (blocks: LayoutBlock[], i: number, change: Partial<LayoutBlock>) =>
  blocks.with(i, Object.freeze({ ...blocks[i]!, ...change }));
const ten = () =>
  Array.from({ length: 10 }, (_, i) =>
    filledBlock("action", 1, { id: `a${i}` }),
  );
const at = (label: string, blockId: string): LockAnchor => ({
  label,
  blockId,
  offset: 0,
  quote: null,
  fallbackIds: [],
  source: "lock",
});

test("nothing changed returns the same result", () => {
  const p = paginate(corpus(), sp);
  expect(repaginate(p, [...p.blocks]) === p).toBe(true);
});

test("an edit gives the pages a full pass gives: typing, a ruler drag, inserting, removing", () => {
  let blocks = corpus();
  let p = paginate(blocks, sp);
  for (const i of [0, 1500, 2999, 700, 701]) {
    blocks = edit(blocks, i, {
      text: blocks[i]!.text + " and then some more words to push a line over.",
    });
    p = repaginate(p, blocks);
    expect(p.pages).toEqual(paginate(blocks, sp).pages);
  }
  // what the ruler and the layout controls write
  blocks = edit(blocks, 400, {
    width: 20,
    indent: 12,
    spaceBefore: 3,
    align: "right",
  });
  p = repaginate(p, blocks);
  expect(p.pages).toEqual(paginate(blocks, sp).pages);
  const fewer = blocks.toSpliced(1000, 3);
  const more = blocks.toSpliced(1000, 0, A(9), filledBlock("scene_heading", 1));
  expect(repaginate(p, fewer).pages).toEqual(paginate(fewer, sp).pages);
  expect(
    repaginate(p, more, { first: 1000, oldEnd: 1000, newEnd: 1002 }).pages,
  ).toEqual(paginate(more, sp).pages);
});

test("a typed character refills a page or two and measures one block, at the first block as in the middle", () => {
  const a = corpus();
  const p = paginate(a, sp);
  for (const i of [0, 1500]) {
    const q = repaginate(p, edit(a, i, { text: a[i]!.text + "x" }));
    expect(q.pages.length).toBe(p.pages.length);
    expect(
      q.pages.filter((page, k) => page !== p.pages[k]).length,
    ).toBeLessThanOrEqual(3);
    expect(q.metrics.filter((m, j) => m !== p.metrics[j]).length).toBe(1);
  }
});

test("a renamed cue reaches the next cue's suffix", () => {
  const a = [
    cueBlock("JANE"),
    filledBlock("dialogue", 1),
    A(1),
    cueBlock("JANE"),
    filledBlock("dialogue", 1),
  ];
  const b = edit(a, 0, { text: "SAM" });
  const q = repaginate(paginate(a, sp), b);
  expect([contdSuffix(q, 3), q.pages]).toEqual([false, paginate(b, sp).pages]);
});

test("locked pages survive an edit", () => {
  const locks = {
    level: 1,
    anchors: [at("1", "a0"), at("2", "a3"), at("3", "a6")],
  };
  const a = ten();
  const b = edit(a, 4, { text: filledText(60, 3) });
  expect(repaginate(paginate(a, sp, locks), b).pages).toEqual(
    paginate(b, sp, locks).pages,
  );
});

test("an edit just past a dual run refills the page that read where the run ends", () => {
  const a = [
    A(53),
    cueBlock("MARA", { dual: "left" }),
    filledBlock("dialogue", 1, { dual: "left" }),
    A(1),
  ];
  const b = a.with(3, cueBlock("COLE", { dual: "right" }));
  expect(repaginate(paginate(a, sp), b).pages).toEqual(paginate(b, sp).pages);
});
