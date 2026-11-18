// Documents and generators shared by the schema's tests.
import fc from "fast-check";
import {
  ACT_BREAK_KINDS,
  ALIGNMENTS,
  BLOCK_TYPES,
  DUALS,
  MARK_NAMES,
} from "../src/index.ts";
import type { BlockJSON, DocJSON, MarkJSON, TextJSON } from "../src/index.ts";

export interface Run {
  text: string;
  marks?: MarkJSON[];
}

/** A valid block ID. */
export const ID = "b000000000000004";

/** The one ID every repair is given. */
export const ids = () => "f1f1f1f1f1f1f1f1";

export function runs(content: string | readonly Run[]): TextJSON[] {
  return typeof content === "string"
    ? [{ type: "text", text: content }]
    : content.map((run) => ({ type: "text", ...run }));
}

/** A doc of one section of one block. */
export function docWith(
  attrs: BlockJSON["attrs"],
  content: string | readonly Run[],
): DocJSON {
  return {
    type: "doc",
    content: [
      {
        type: "section",
        content: [{ type: "block", attrs, content: runs(content) }],
      },
    ],
  };
}

export const MARK_ATTRS: Record<string, Record<string, unknown>> = {
  color: { value: "red" },
  highlight: { value: "red" },
  link: { href: "https://example.com" },
  suggest_insert: { id: "s1", authorUserId: "dana", at: 5 },
  suggest_delete: { id: "s1", authorUserId: "dana", at: 5 },
};

/** One run per mark name, each with full attributes. */
export const ALL_MARKS: Run[] = MARK_NAMES.map((name) => {
  const attrs = MARK_ATTRS[name];
  return {
    text: name,
    marks: [attrs ? { type: name, attrs } : { type: name }],
  };
});

const HREFS = [
  "https://example.com",
  "mailto:a@example.com",
  "tel:+15551234",
  "javascript:alert(1)",
];
const markArb: fc.Arbitrary<MarkJSON> = fc.oneof(
  fc
    .constantFrom("bold", "italic", "underline", "strike", "caps")
    .map((type) => ({ type })),
  fc.string().map((value) => ({ type: "color", attrs: { value } })),
  fc.constantFrom(...HREFS).map((href) => ({ type: "link", attrs: { href } })),
);
const textArb: fc.Arbitrary<TextJSON> = fc.record({
  type: fc.constant("text" as const),
  text: fc.string({ minLength: 1 }),
  marks: fc.uniqueArray(markArb, {
    selector: (mark) => mark.type,
    maxLength: 3,
  }),
});
const blockArb: fc.Arbitrary<BlockJSON> = fc.record({
  type: fc.constant("block" as const),
  attrs: fc.record({
    id: fc.stringMatching(/^[A-Za-z0-9_-]{16}$/),
    type: fc.constantFrom(...BLOCK_TYPES),
  }),
  content: fc.array(textArb, { maxLength: 3 }),
});

/** Well-formed documents, some with empty sections and unsafe links. */
export const docArb: fc.Arbitrary<DocJSON> = fc.record({
  type: fc.constant("doc" as const),
  content: fc.array(
    fc.record({
      type: fc.constant("section" as const),
      content: fc.array(blockArb, { maxLength: 3 }),
    }),
    { maxLength: 4 },
  ),
});

// Valid documents with known attributes and marks only: every attribute is
// sometimes absent, nullable ones sometimes null, and adjacent runs often
// carry the same marks in another order.
const orNull = <T>(value: fc.Arbitrary<T>) =>
  fc.oneof(value, fc.constant(null));
const word = fc.constantFrom("s1", "s2", "");
const count = fc.constantFrom(0, 1, 4);
const knownMarkArb: fc.Arbitrary<MarkJSON> = fc.oneof(
  fc
    .constantFrom("bold", "italic", "underline", "strike", "caps")
    .map((type) => ({ type })),
  fc.record(
    {
      type: fc.constantFrom("color", "highlight"),
      attrs: fc.record({ value: word }, { requiredKeys: [] }),
    },
    { requiredKeys: ["type"] },
  ),
  fc.record({
    type: fc.constant("link"),
    attrs: fc.record({ href: fc.constant("https://example.com") }),
  }),
  fc.record({
    type: fc.constantFrom("suggest_insert", "suggest_delete"),
    attrs: fc.record(
      { id: word, authorUserId: word, at: count },
      { requiredKeys: [] },
    ),
  }),
);
const knownTextArb: fc.Arbitrary<TextJSON> = fc.record(
  {
    type: fc.constant("text" as const),
    text: fc.constantFrom("a", "b c"),
    marks: fc.uniqueArray(knownMarkArb, {
      selector: (mark) => mark.type,
      maxLength: 3,
    }),
  },
  { requiredKeys: ["type", "text"] },
);
const knownBlockArb: fc.Arbitrary<BlockJSON> = fc.record(
  {
    type: fc.constant("block" as const),
    attrs: fc.record(
      {
        id: orNull(fc.constantFrom("b000000000000001", "b000000000000002")),
        type: fc.constantFrom(...BLOCK_TYPES),
        num: orNull(fc.constantFrom("12", "12A")),
        omitted: fc.boolean(),
        dual: orNull(fc.constantFrom(...DUALS)),
        synopsis: word,
        align: orNull(fc.constantFrom(...ALIGNMENTS)),
        indent: orNull(count),
        width: orNull(count),
        spaceBefore: orNull(count),
        noContd: fc.boolean(),
        noTiming: fc.boolean(),
        writerUserId: orNull(word),
        suggest: orNull(fc.constantFrom("added", "removed", "action")),
        from: orNull(fc.constant("b000000000000001:k9")),
        kind: orNull(fc.constantFrom(...ACT_BREAK_KINDS)),
        suggestId: orNull(word),
        suggestAuthorUserId: orNull(word),
        suggestAt: orNull(count),
      },
      { requiredKeys: [] },
    ),
    content: fc.array(knownTextArb, { maxLength: 4 }),
  },
  { requiredKeys: ["type"] },
);
export const arbKnownDoc: fc.Arbitrary<DocJSON> = fc.record({
  type: fc.constant("doc" as const),
  content: fc.array(
    fc.record({
      type: fc.constant("section" as const),
      content: fc.array(knownBlockArb, { minLength: 1, maxLength: 3 }),
    }),
    { minLength: 1, maxLength: 3 },
  ),
});
