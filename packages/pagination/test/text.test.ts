import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import {
  FONT_METRICS,
  clusterCells,
  fontRanges,
  fontSubset,
  graphemeEnd,
  offFontRanges,
  sanitizeText,
  upperCase,
} from "../src/index.ts";

const GRAPHEME_BREAK_TEST = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "tools",
  "unicode",
  "ucd-15.0.0",
  "GraphemeBreakTest.txt",
);

const arbUtf16 = fc
  .array(fc.integer({ min: 0, max: 0xffff }), { maxLength: 200 })
  .map((u) => String.fromCharCode(...u));

const isHigh = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
const isLow = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;
const splitsPair = (s: string, at: number) =>
  at > 0 && isHigh(s.charCodeAt(at - 1)) && isLow(s.charCodeAt(at));

/** Every code point of inclusive `[from, to, …]` pairs. */
const codePointsOf = (ranges: readonly number[]) => {
  const out: number[] = [];
  for (let i = 0; i < ranges.length; i += 2)
    for (let cp = ranges[i]!; cp <= ranges[i + 1]!; cp++) out.push(cp);
  return out;
};

/** Each case of the file: its text and the offsets of its breaks after the first unit. */
const graphemeBreakCases = () =>
  readFileSync(GRAPHEME_BREAK_TEST, "utf8")
    .split("\n")
    .map((line) => line.split("#")[0]!.trim())
    .filter((line) => line !== "")
    .map((line) => {
      let text = "";
      const breaks: number[] = [];
      for (const token of line.split(new RegExp("\\s+")))
        if (token === "÷") breaks.push(text.length);
        else if (token !== "×")
          text += String.fromCodePoint(parseInt(token, 16));
      return { text, breaks: breaks.filter((at) => at > 0) };
    });

const ends = (text: string) => {
  const out: number[] = [];
  let i = 0;
  while (i < text.length) {
    i = graphemeEnd(text, i);
    out.push(i);
  }
  return out;
};

test("all 602 grapheme break cases of the pinned release pass", () => {
  const cases = graphemeBreakCases();
  expect(cases.length).toBe(602);
  expect(
    cases.filter(({ text, breaks }) => ends(text).join() !== breaks.join()),
  ).toEqual([]);
});

test("clusters", () => {
  expect([
    graphemeEnd("e\u0301x", 0),
    graphemeEnd("\u{1f468}\u200d\u{1f469}\u200d\u{1f467}x", 0),
    graphemeEnd("\u{1f1e8}\u{1f1e6}\u{1f1eb}\u{1f1f7}", 0),
    graphemeEnd("\r\n", 0),
    graphemeEnd("\ud83dx", 0),
  ]).toEqual([2, 8, 4, 2, 1]);
});

test("an offset inside a surrogate pair is read from the pair's start", () => {
  expect([
    graphemeEnd("a\u{1f44d}b", 2),
    graphemeEnd("a\u{1f44d}b", 1),
  ]).toEqual([3, 3]);
});

test("any string is segmented without loss", () => {
  fc.assert(
    fc.property(arbUtf16, (s) => {
      let i = 0;
      while (i < s.length) {
        const e = graphemeEnd(s, i);
        expect(e).toBeGreaterThan(i);
        expect(splitsPair(s, e)).toBe(false);
        i = e;
      }
      expect(i).toBe(s.length);
    }),
    { numRuns: 500 },
  );
});

test("capitals come from the shipped table", () => {
  expect([
    upperCase("straße"),
    upperCase("ﬁn"),
    upperCase("ŉ"),
    upperCase("i"),
  ]).toEqual(["STRASSE", "FIN", "ʼN", "I"]);
  for (const cp of codePointsOf(fontRanges("latin")).concat(
    codePointsOf(fontRanges("latin-ext")),
  ))
    // a test may ask the runtime
    expect(upperCase(String.fromCodePoint(cp))).toBe(
      String.fromCodePoint(cp).toUpperCase(),
    );
});

const cells = (t: string, caps = false) => clusterCells(t, 0, t.length, caps);

test("cells", () => {
  expect([
    cells("a"),
    cells("日"),
    cells("\u{1f44d}"),
    cells("e\u0301"),
    cells("ß", true),
    cells("\u200d"),
    cells("\ud83d"),
  ]).toEqual([1, 2, 2, 1, 2, 0, 1]);
});

test("the script font's character set", () => {
  expect([
    codePointsOf(fontRanges("latin")).length,
    codePointsOf(fontRanges("latin-ext")).length,
  ]).toEqual([216, 141]);
  expect(
    [0x41, 0xe9, 0x2014, 0x20ac, 0x141, 0x65e5, 0x1f44d].map(fontSubset),
  ).toEqual(["latin", "latin", "latin", "latin", "latin-ext", null, null]);
  expect([
    offFontRanges("Tea 日本 now \u{1f44d}"),
    offFontRanges("plain"),
  ]).toEqual([[4, 6, 11, 13], []]);
  expect(FONT_METRICS).toEqual({
    advance: 1228,
    unitsPerEm: 2048,
    ascent: 1600,
    descent: -700,
  });
});

test("pasted text is made safe for the page, and joiners are kept", () => {
  expect(sanitizeText("a\tb\u00adc\u200bd\u2060e\ufefff\r\ng\rh")).toBe(
    "a bcdef\ng\nh",
  );
  expect(sanitizeText("می\u200cخواهم \u{1f468}\u200d\u{1f469}")).toBe(
    "می\u200cخواهم \u{1f468}\u200d\u{1f469}",
  );
});
