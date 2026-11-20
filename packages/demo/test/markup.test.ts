import { expect, test } from "bun:test";
import fc from "fast-check";
import { BLOCK_TYPES } from "@manent/schema";
import type { BlockType } from "@manent/schema";
import {
  blocksToText,
  parseSeedText,
  SeedTextError,
} from "../src/content/markup.ts";
import type { SeedBlock } from "../src/content/markup.ts";

const SAMPLE = `
— p. 17 — (header: Blue Rev.)
action Rain on the window.
character JANE
dialogue You're late. *
scene_heading [25] OMITTED *
scene_heading [26A] INT. CALLOW PARADE - PHARMACY - NIGHT *
act_break ACT ONE
body Strictly speaking I am *a* Looki, and **here**.
`;

const refusal = (source: string): [string, number, string] | null => {
  try {
    parseSeedText(source);
  } catch (error) {
    if (error instanceof SeedTextError)
      return [error.code, error.line, error.message];
    throw error;
  }
  return null;
};

test("one element per line, with pages, numbers, marks and omissions to check", () => {
  const p = parseSeedText(SAMPLE);
  expect(p.blocks.map((b) => [b.element, b.text, b.kind])).toEqual([
    ["action", "Rain on the window.", null],
    ["character", "JANE", null],
    ["dialogue", "You're late.", null],
    ["scene_heading", "OMITTED", null],
    ["scene_heading", "INT. CALLOW PARADE - PHARMACY - NIGHT", null],
    ["act_break", "ACT ONE", "new_act"],
    ["body", "Strictly speaking I am a Looki, and here.", null],
  ]);
  expect([p.pageStarts, p.numbers, p.marked, p.omitted]).toEqual([
    [{ label: "17", blockIndex: 0 }],
    [
      { blockIndex: 3, num: "25" },
      { blockIndex: 4, num: "26A" },
    ],
    [2, 3, 4],
    [3],
  ]);
  expect(p.blocks[6]!.marks).toEqual([
    { mark: "italic", from: 23, to: 24 },
    { mark: "bold", from: 36, to: 40 },
  ]);
});

test("two marks side by side stay apart", () => {
  expect(refusal("body *a**b*")).toEqual(["bad_mark", 1, "line 1: bad_mark"]);
  expect(parseSeedText("body *a* *b*").blocks).toEqual([
    {
      element: "body",
      text: "a b",
      marks: [
        { mark: "italic", from: 0, to: 1 },
        { mark: "italic", from: 2, to: 3 },
      ],
      kind: null,
    },
  ]);
});

test("a line that is not an element is refused with its line number", () => {
  expect(refusal("action Rain.\nspeech Hello")).toEqual([
    "bad_element",
    2,
    "line 2: bad_element",
  ]);
  expect(refusal("dialogue")).toEqual(["bad_line", 1, "line 1: bad_line"]);
});

test("an asterisk with a space on each side is text, not a mark", () => {
  expect(
    parseSeedText("break *\ngeneral * [Check the van]\ngeneral ** [Knock]")
      .blocks,
  ).toEqual([
    { element: "break", text: "*", marks: [], kind: null },
    { element: "general", text: "* [Check the van]", marks: [], kind: null },
    { element: "general", text: "** [Knock]", marks: [], kind: null },
  ]);
});

test("each kind of act break is read from its words, and any other words are refused", () => {
  expect(
    parseSeedText(
      "act_break ACT TWO\nact_break TEASER\nact_break TAG\nact_break END OF ACT TWO",
    ).blocks.map((b) => b.kind),
  ).toEqual(["new_act", "teaser", "tag", "end_of_act"]);
  expect(refusal("action Rain.\nact_break INTERVAL")).toEqual([
    "bad_line",
    2,
    "line 2: bad_line",
  ]);
});

test("a page rule with no element after it is refused", () => {
  expect(refusal("— p. 3 —\n— p. 4 —\naction Rain.")).toEqual([
    "bad_line",
    1,
    "line 1: bad_line",
  ]);
  expect(refusal("action Rain.\n— p. 12 (end) —")).toEqual([
    "bad_line",
    2,
    "line 2: bad_line",
  ]);
});

const WORDS = [
  "Rain",
  "on",
  "the",
  "window.",
  "JANE",
  "You're",
  "late,",
  "OMITTED",
  "ACT",
  "-",
  "{finn_found}",
  "[Check",
  "van]",
  "tock-tock-tock",
  "here?",
] as const;
const UNMARKED_TEXTS = ["*", "* [Check the van]", "** [Knock]"] as const;
const ACT_BREAKS = [
  ["ACT ONE", "new_act"],
  ["TEASER", "teaser"],
  ["TAG", "tag"],
  ["END OF ACT ONE", "end_of_act"],
] as const;

const markedText = fc
  .array(
    fc.record({
      word: fc.constantFrom(...WORDS),
      mark: fc.constantFrom("italic", "bold", null),
    }),
    { minLength: 1, maxLength: 6 },
  )
  .map((words) => {
    let text = "";
    const marks: SeedBlock["marks"][number][] = [];
    for (const { word, mark } of words) {
      if (text !== "") text += " ";
      if (mark !== null)
        marks.push({ mark, from: text.length, to: text.length + word.length });
      text += word;
    }
    return { text, marks };
  });

const seedBlock: fc.Arbitrary<SeedBlock> = fc
  .constantFrom<BlockType>(...BLOCK_TYPES)
  .chain((element): fc.Arbitrary<SeedBlock> =>
    element === "act_break"
      ? fc
          .constantFrom(...ACT_BREAKS)
          .map(([text, kind]) => ({ element, text, marks: [], kind }))
      : fc
          .oneof(
            markedText,
            fc
              .constantFrom(...UNMARKED_TEXTS)
              .map((text) => ({ text, marks: [] })),
          )
          .map(({ text, marks }) => ({ element, text, marks, kind: null })),
  );

test("text round-trips through its markup", () => {
  fc.assert(
    fc.property(fc.array(seedBlock, { maxLength: 12 }), (blocks) => {
      expect(parseSeedText(blocksToText(blocks)).blocks).toEqual(blocks);
    }),
    { numRuns: 300 },
  );
});

test("any text is read, or refused at a line it holds", () => {
  const unit = fc.constantFrom(
    "action ",
    "act_break ",
    "scene_heading ",
    "ACT ",
    "[2] ",
    "— p. 4 —",
    "*",
    " ",
    "\n",
    "a",
  );
  fc.assert(
    fc.property(fc.string({ unit, maxLength: 30 }), (source) => {
      const refused = refusal(source);
      if (refused !== null)
        expect(refused[1]).toBeLessThanOrEqual(source.split("\n").length);
    }),
    { numRuns: 1000 },
  );
});

test("a block the markup cannot hold is refused instead of being written wrongly", () => {
  const cases: SeedBlock[] = [
    {
      element: "action",
      text: "Rain",
      marks: [{ mark: "underline", from: 0, to: 4 }],
      kind: null,
    },
    { element: "action", text: "Rain *", marks: [], kind: null },
    { element: "scene_heading", text: "[3] DOCK", marks: [], kind: null },
    { element: "act_break", text: "ACT ONE", marks: [], kind: "teaser" },
  ];
  expect(
    cases.map((block) => {
      try {
        return blocksToText([block]);
      } catch (error) {
        return error instanceof RangeError;
      }
    }),
  ).toEqual([true, true, true, true]);
});
