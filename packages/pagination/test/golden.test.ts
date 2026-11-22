import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  comparePageLabels,
  pageStarts,
  paginate,
  profileFor,
} from "../src/index.ts";
import type {
  LayoutBlock,
  LockAnchor,
  LockTable,
  Page,
  Pagination,
} from "../src/index.ts";
import {
  CORPUS_FORMATS,
  RULE_SCRIPTS,
  corpusId,
  filledBlock,
  generateBlocks,
  layoutBlocksOf,
} from "../src/testing/index.ts";
import type { CorpusFormat } from "../src/testing/index.ts";

interface Golden {
  readonly name: string;
  readonly paginate: () => Pagination;
}

const sp = profileFor("screenplay")!;
const corpus = (format: CorpusFormat) =>
  layoutBlocksOf(generateBlocks(format, 3000, 1));
const pageLabelled = (p: Pagination, label: string) =>
  p.pages.find((page) => page.label === label)!;

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

// A new action of `lines` lines after the first block of the page labelled `label`, with the next unused corpus id.
const insertAction = (
  p: Pagination,
  label: string,
  lines: number,
): LayoutBlock[] =>
  p.blocks.toSpliced(
    pageLabelled(p, label).block + 1,
    0,
    filledBlock("action", lines, { id: corpusId(p.blocks.length) }),
  );

// The screenplay corpus locked at each of its first 20 page starts.
const lockedCorpus = (): Pagination => {
  const p = paginate(corpus("screenplay"), sp);
  const anchors = p.pages
    .slice(0, 20)
    .map((page, k) => anchorAt(p.blocks, page, String(k + 1)));
  return paginate(p.blocks, sp, { level: 1, anchors });
};

// The pages between 12 and 13 locked at level 2 with their labels.
const lockAPages = (p: Pagination): LockTable => {
  const twelve = pageLabelled(p, "12").index;
  const thirteen = pageLabelled(p, "13").index;
  const aPages = p.pages
    .slice(twelve + 1, thirteen)
    .map((page) => anchorAt(p.blocks, page, page.label));
  const after = p.locks.anchors.findIndex((a) => a.label === "12") + 1;
  const anchors = p.locks.anchors.toSpliced(after, 0, ...aPages);
  return { level: 2, anchors };
};

const rulePages = (name: string) => {
  const s = RULE_SCRIPTS.find((x) => x.name === name)!;
  return paginate(layoutBlocksOf(s.blocks), profileFor(s.format)!);
};

const GOLDENS: readonly Golden[] = [
  ...CORPUS_FORMATS.map((format) => ({
    name: `corpus-${format}-letter`,
    paginate: () => paginate(corpus(format), profileFor(format)!),
  })),
  {
    name: "corpus-screenplay-a4",
    paginate: () =>
      paginate(
        corpus("screenplay"),
        profileFor("screenplay", { paper: "a4" })!,
      ),
  },
  ...RULE_SCRIPTS.map((s) => ({
    name: `rule-${s.name}`,
    paginate: () => rulePages(s.name),
  })),
  {
    name: "locked-screenplay",
    paginate: () => {
      const p = lockedCorpus();
      return paginate(insertAction(p, "5", 40), sp, p.locks);
    },
  },
  {
    name: "locked-a-pages",
    paginate: () => {
      const locked = lockedCorpus();
      const overflowed = paginate(
        insertAction(locked, "12", 60),
        sp,
        locked.locks,
      );
      const aLocked = paginate(overflowed.blocks, sp, lockAPages(overflowed));
      return paginate(insertAction(aLocked, "12", 60), sp, aLocked.locks);
    },
  },
];

function record(g: Golden) {
  const p = g.paginate();
  const starts = pageStarts(p);
  return {
    engineVersion: p.engineVersion,
    format: p.profile.format,
    paper: p.profile.paper,
    blocks: p.blocks.length,
    pages: p.pages.map((page, k) => ({
      label: page.label,
      block: p.blocks[page.block]!.id,
      line: page.line,
      more: page.more,
      contd: page.contd,
      firstLine: starts[k]!.firstLine,
    })),
  };
}

for (const g of GOLDENS)
  test(`the pages of ${g.name} have not moved`, async () => {
    const path = join(import.meta.dir, "golden", "v1", `${g.name}.json`);
    const actual = record(g);
    if (!(await Bun.file(path).exists())) {
      if (process.env.UPDATE_GOLDEN !== "1")
        throw new Error(
          `golden ${g.name} is missing: run this file once with UPDATE_GOLDEN=1, read the result, commit it`,
        );
      // only ever creates a file: an existing golden is never overwritten
      await Bun.write(path, JSON.stringify(actual, null, 2) + "\n");
    }
    // a page that moved is a new engine version, never an edit to this one;
    // a fresh handle, as one that saw no file reads empty after the write
    expect(actual).toEqual(await Bun.file(path).json());
  });

test("each rule script shows its rule", () => {
  expect(
    rulePages("long-speech").pages.map((x) => [
      x.block,
      x.line,
      x.more,
      x.contd,
    ]),
  ).toEqual([
    [0, 0, true, null],
    [2, 11, true, "MARA"],
    [2, 63, false, "MARA"],
  ]);
  expect([
    rulePages("short-actions").pages.filter((x) => x.line > 0),
    rulePages("many-cues").pages.map((x) => x.block),
    rulePages("page-breaks").pages.map((x) => x.block),
    rulePages("dual").pages.length,
  ]).toEqual([[], [0, 27, 54], [0, 2, 5], 1]);
  expect(
    rulePages("transitions").pages.filter(
      (x) =>
        x.line === 0 &&
        rulePages("transitions").blocks[x.block]!.type === "transition",
    ),
  ).toEqual([]);
  expect([
    rulePages("tall-dual").pages[1]!.right,
    rulePages("tall-block").pages.filter((x) => x.usedUnits === 0),
    rulePages("manuscript-chapters").pages.filter((x) => x.forced).length,
  ]).toEqual([{ block: 4, line: 11, offset: 308 }, [], 2]);
});

test("a locked script never prints one label twice", () => {
  for (const name of ["locked-screenplay", "locked-a-pages"]) {
    const labels = record(GOLDENS.find((g) => g.name === name)!).pages.map(
      (x) => x.label,
    );
    expect([new Set(labels).size, labels.toSorted(comparePageLabels)]).toEqual([
      labels.length,
      labels,
    ]);
  }
  expect(
    record(GOLDENS.find((g) => g.name === "locked-a-pages")!).pages.map(
      (x) => x.label,
    ),
  ).toEqual(expect.arrayContaining(["12", "A12A", "12A", "12B", "13"]));
});
