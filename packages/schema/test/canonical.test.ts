import { expect, test } from "bun:test";
import fc from "fast-check";
import { canonicalBlock, canonicalDoc, parseDoc } from "../src/index.ts";
import type { DocJSON, TextJSON } from "../src/index.ts";
import { arbKnownDoc } from "./helpers.ts";

const ID = "b1b1b1b1b1b1b1b1";
const EXPECTED =
  '{"type":"doc","content":[{"type":"section","content":[{"type":"block","attrs":{"id":"b1b1b1b1b1b1b1b1","type":"action","omitted":false,"synopsis":"","noContd":false,"noTiming":false},' +
  '"content":[{"type":"text","text":"Rain "},{"type":"text","text":"falls","marks":[{"type":"bold"},{"type":"suggest_insert","attrs":{"id":"s1","authorUserId":"dana","at":0}}]}]}]}]}';

/** A document of one action block holding `runs`. */
const docOf = (runs: TextJSON[]): DocJSON => ({
  type: "doc",
  content: [
    {
      type: "section",
      content: [
        { type: "block", attrs: { type: "action", id: ID }, content: runs },
      ],
    },
  ],
});

/** One canonical block of one run carrying `marks`, two attributes given as undefined. */
const blockOf = (marks: TextJSON["marks"]) =>
  canonicalBlock({
    type: "block",
    attrs: { id: ID, synopsis: undefined, glow: undefined },
    content: [{ type: "text", text: "x", marks }],
  });

test("every spelling of one document has one canonical form", () => {
  const runs: TextJSON[] = [
    { type: "text", text: "Ra" },
    { type: "text", text: "in " },
    { type: "text", text: "" },
    {
      type: "text",
      text: "falls",
      marks: [
        { type: "suggest_insert", attrs: { authorUserId: "dana", id: "s1" } },
        { type: "bold" },
      ],
    },
  ];
  const sparse = docOf(runs);
  // ProseMirror's spelling: nineteen attributes, nulls included; it holds no empty run
  const full: DocJSON = parseDoc(
    docOf(runs.filter((run) => run.text !== "")),
  ).toJSON();
  expect(JSON.stringify(canonicalDoc(sparse))).toBe(EXPECTED);
  expect(JSON.stringify(canonicalDoc(full))).toBe(EXPECTED);
});

test("what a newer build wrote is kept, in a fixed place", () => {
  const block = canonicalBlock({
    type: "block",
    attrs: { zeta: 1, id: ID, glow: 3, dual: null, gone: null },
    content: [
      {
        type: "text",
        text: "x",
        marks: [
          { type: "wobble", attrs: { b: 1, a: 2 } },
          { type: "blink" },
          { type: "italic" },
        ],
      },
    ],
  });
  expect(JSON.stringify(block)).toBe(
    '{"type":"block","attrs":{"id":"b1b1b1b1b1b1b1b1","type":"action","omitted":false,"synopsis":"","noContd":false,"noTiming":false,"glow":3,"zeta":1},' +
      '"content":[{"type":"text","text":"x","marks":[{"type":"italic"},{"type":"blink"},{"type":"wobble","attrs":{"a":2,"b":1}}]}]}',
  );
});

test("two marks of one name keep one order, and an undefined attribute is absent", () => {
  const second = {
    type: "suggest_insert",
    attrs: { id: "s2", authorUserId: "eli" },
  };
  const first = {
    type: "suggest_insert",
    attrs: { id: "s1", authorUserId: "dana", at: 5 },
  };
  const expected =
    '{"type":"block","attrs":{"id":"b1b1b1b1b1b1b1b1","type":"action","omitted":false,"synopsis":"","noContd":false,"noTiming":false},' +
    '"content":[{"type":"text","text":"x","marks":[{"type":"suggest_insert","attrs":{"id":"s1","authorUserId":"dana","at":5}},{"type":"suggest_insert","attrs":{"id":"s2","authorUserId":"eli","at":0}}]}]}';
  const block = blockOf([second, first]);
  expect(JSON.stringify(block)).toBe(expected);
  expect(JSON.stringify(blockOf([first, second]))).toBe(expected);
  // JSON.stringify drops an undefined value; the key itself must be gone too
  expect(Object.keys(block.attrs ?? {})).toEqual([
    "id",
    "type",
    "omitted",
    "synopsis",
    "noContd",
    "noTiming",
  ]);
});

test("an empty block, section and document have no content key", () => {
  expect(
    JSON.stringify(
      canonicalDoc({
        type: "doc",
        content: [
          {
            type: "section",
            content: [{ type: "block", attrs: { id: ID }, content: [] }],
          },
        ],
      }),
    ),
  ).toBe(
    '{"type":"doc","content":[{"type":"section","content":[{"type":"block","attrs":{"id":"b1b1b1b1b1b1b1b1","type":"action","omitted":false,"synopsis":"","noContd":false,"noTiming":false}}]}]}',
  );
  expect(JSON.stringify(canonicalDoc({ type: "doc" }))).toBe('{"type":"doc"}');
});

test("the canonical form is a fixed point, and ProseMirror's spelling reaches it", () => {
  fc.assert(
    fc.property(arbKnownDoc, (doc) => {
      const once = JSON.stringify(canonicalDoc(doc));
      expect(JSON.stringify(canonicalDoc(canonicalDoc(doc)))).toBe(once);
      expect(JSON.stringify(canonicalDoc(parseDoc(doc).toJSON()))).toBe(once);
      expect(parseDoc(canonicalDoc(doc)).eq(parseDoc(doc))).toBe(true);
    }),
    { numRuns: 500 },
  );
});
