import { expect, mock, test } from "bun:test";
import fc from "fast-check";
import {
  BLOCK_SLACK_CELLS,
  STYLE,
  WRAP_MODE,
  breakAllowed,
  clusterCells,
  graphemeEnd,
  wrap,
} from "../src/index.ts";
import type { WrapOptions } from "../src/index.ts";

const TUNING = "../src/engines/v1/tuning.ts";
const TUNED = { WRAP_MODE, BLOCK_SLACK_CELLS };

const arbUtf16 = fc
  .array(fc.integer({ min: 0, max: 0xffff }), { maxLength: 200 })
  .map((u) => String.fromCharCode(...u));

const w = (text: string, width: number, o?: WrapOptions) => [
  ...wrap(text, width, o),
];

/** Every kind of character the wrapper and its break rules tell apart. */
const arbScriptText = fc
  .array(
    fc.constantFrom(
      "a",
      "b",
      " ",
      "\t",
      "\n",
      "\r\n",
      "-",
      "\u2013",
      "\u2014",
      "/",
      "(",
      ")",
      '"',
      "'",
      ".",
      "!",
      "…",
      "\u00a0",
      "1",
      "ß",
      "日",
      "\u{1f44d}",
      "\u{1f1e8}\u{1f1e6}",
      "\u200d",
      "\u200b",
      "e\u0301",
      "\ud83d",
    ),
    { maxLength: 60 },
  )
  .map((parts) => parts.join(""));

const clusterEnds = (s: string) => {
  const ends: number[] = [];
  let i = 0;
  while (i < s.length) {
    i = graphemeEnd(s, i);
    ends.push(i);
  }
  return ends;
};
const isClusterBoundary = (s: string, at: number) =>
  at === 0 || clusterEnds(s).includes(at);
const clusterCount = (s: string) => clusterEnds(s).length;
const cellsOf = (s: string, caps = false) => clusterCells(s, 0, s.length, caps);
const clusterStartOf = (s: string, at: number) =>
  [0, ...clusterEnds(s)].findLast((end) => end <= at)!;
const lineOf = (s: string, starts: readonly number[], i: number) =>
  s
    .slice(starts[i]!, starts[i + 1] ?? s.length)
    .replace(new RegExp("[ \\t]*(?:\\r?\\n)?$"), "");

test("spaces at the end of a line hang, and an empty block is one line", () => {
  expect([
    w("", 10),
    w("hello world", 5),
    w("hello  world", 5),
    w("abcd    ", 4),
    w("          ", 4),
    w("aaaa bbbb", 9),
    w("aaaa bbbbb", 9),
  ]).toEqual([[0], [0, 6], [0, 7], [0], [0], [0], [0, 5]]);
});

test("under break-spaces a space that does not fit starts the next line", () => {
  mock.module(TUNING, () => ({ ...TUNED, WRAP_MODE: "break-spaces" }));
  try {
    expect([w("abcd    ", 4), w("hello world", 5)]).toEqual([
      [0, 4],
      [0, 5, 6],
    ]);
  } finally {
    mock.module(TUNING, () => TUNED);
  }
});

test("a word too long for a line moves to its own line and is then cut", () => {
  expect([w("abcdefghij", 4), w("ab cdefgh", 4)]).toEqual([
    [0, 4, 8],
    [0, 3, 7],
  ]);
});

test("hyphens, dashes, slashes and quotes", () => {
  expect([
    w("well-known fact", 8),
    w("a-b", 2),
    w("x -5", 3),
    w("stop\u2014now", 5),
    w("stop\u2014now", 4),
    w("and/or", 4),
    w('go\u2014"x"', 3),
    w("go on ...", 6),
  ]).toEqual([
    [0, 5, 11],
    [0, 2],
    [0, 2],
    [0, 5],
    [0, 4],
    [0, 4],
    [0, 2, 5],
    [0, 3],
  ]); // a closing mark after a space stays with the word before it
});

test("a line never ends just after a slash", () => {
  const text =
    "He wants either/or, and/or both, yes/no answers and a 50/50 split of the catch.";
  // the lines Chromium draws at 25 and 38 cells
  expect([w(text, 25), w(text, 38)]).toEqual([
    [0, 20, 40, 66],
    [0, 33, 69],
  ]);
});

test("a newline, a first-line indent and a forced offset each start or shorten a line", () => {
  expect([
    w("ab\ncd", 10),
    w("aaaa bbbb cccc", 10, { firstLineIndent: 5 }),
    w("aaaa bbbb cccc", 60, { forced: [5] }),
  ]).toEqual([
    [0, 3],
    [0, 5],
    [0, 5],
  ]);
});

test("capitals are counted as drawn", () => {
  const styles = new Uint8Array(6);
  styles[4] = STYLE.CAPS;
  expect([
    w("straße", 6),
    w("straße", 6, { capitalized: true }),
    w("straße", 6, { styles }),
  ]).toEqual([[0], [0, 5], [0, 5]]);
});

test("wide clusters take two cells and are never cut", () => {
  expect([
    w("日本語日本語", 5),
    w("ab\u{1f468}\u200d\u{1f469}\u200d\u{1f467}cd", 3),
  ]).toEqual([
    [0, 2, 4],
    [0, 2, 10],
  ]);
});

test("a line may end beside a wide cluster however the cluster is built", () => {
  const cases: [string, number][] = [
    ["\u{1f1e8}\u{1f1e6}\u{1f1eb}\u{1f1f7}x", 4],
    ["\u{1f1e8}\u{1f1e6}\u{1f1eb}\u{1f1f7}x", 8],
    ["\u{1f1e8}\u{1f1e6}\u{1f1eb}x", 4],
    ["\u{1f1e8}\u{1f1e6}\u{1f1eb}x", 6],
    ["\u65e5\u0301a", 2],
    ["e\u0301a", 2],
    ["\u{1f44d}\u{1f3fd}a", 4],
    ["\ud55ca", 1],
    ["\ud83d\u{1f44d}", 1],
  ];
  expect(cases.map(([text, at]) => breakAllowed(text, at))).toEqual([
    true,
    true,
    true,
    false,
    true,
    false,
    true,
    true,
    true,
  ]);
});

test("a line may end after a wide Hangul syllable built from jamo, and not inside a narrow one", () => {
  const cases: [string, number][] = [
    ["\u1100\u1161a", 2],
    ["\u1100\u1161\u11a8a", 3],
    ["\ud558\u11a8a", 2],
    ["\ud55c\u11a8a", 2],
    ["\u1160\u11a8a", 2],
  ];
  expect(cases.map(([text, at]) => breakAllowed(text, at))).toEqual([
    true,
    true,
    true,
    true,
    false,
  ]);
});

test("a long run of conjoining Hangul jamo is cut at every full line, in time that grows with its length", () => {
  // Each vowel and trailing jamo pair is one cluster of one cell, and no rule breaks between two.
  expect(w("\u1160\u11a8".repeat(25_000), 60)).toEqual(
    Array.from({ length: 417 }, (_, line) => line * 120),
  );
});

test("wrap is total", () => {
  fc.assert(
    fc.property(arbUtf16, fc.integer({ min: -3, max: 70 }), (s, width) => {
      const starts = w(s, width);
      expect(starts[0]).toBe(0);
      for (let i = 1; i < starts.length; i++) {
        expect(starts[i]!).toBeGreaterThan(starts[i - 1]!);
        expect(isClusterBoundary(s, starts[i]!)).toBe(true);
      }
      for (let i = 0; i < starts.length; i++) {
        const line = lineOf(s, starts, i);
        expect(
          cellsOf(line) <= Math.max(1, width) || clusterCount(line) === 1,
        ).toBe(true); // too wide only when it is one cluster
      }
    }),
    // a line ending in a carriage return and a line feed
    { numRuns: 500, examples: [["\u0000\r\n", 0]] },
  );
});

test("text built from every character the rules tell apart wraps within its width", () => {
  fc.assert(
    fc.property(
      arbScriptText,
      fc.integer({ min: -1, max: 12 }),
      fc.record({
        firstLineIndent: fc.integer({ min: 0, max: 8 }),
        capitalized: fc.boolean(),
        forced: fc.array(fc.integer({ min: -2, max: 70 }), { maxLength: 4 }),
      }),
      (s, width, options) => {
        const starts = w(s, width, options);
        expect(starts[0]).toBe(0);
        for (let i = 1; i < starts.length; i++) {
          expect(starts[i]!).toBeGreaterThan(starts[i - 1]!);
          expect(isClusterBoundary(s, starts[i]!)).toBe(true);
        }
        for (const at of options.forced)
          if (at > 0 && at < s.length)
            expect(starts).toContain(clusterStartOf(s, at));
        for (let i = 0; i < starts.length; i++) {
          const line = lineOf(s, starts, i);
          const taken = i === 0 ? options.firstLineIndent : 0;
          expect(
            cellsOf(line, options.capitalized) + taken <= Math.max(1, width) ||
              clusterCount(line) <= 1,
          ).toBe(true);
        }
      },
    ),
    { numRuns: 500 },
  );
});
