import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  ACT_BREAK_KINDS,
  BLOCK_TYPES,
  DEFAULT_BLOCK_ATTRS,
  MARK_NAMES,
  normalizeDoc,
  parseDoc,
  rejects,
  sectionize,
  validateDoc,
} from "../src/index.ts";
import type {
  BlockJSON,
  DocJSON,
  IssueCode,
  MarkJSON,
  Severity,
  TextJSON,
} from "../src/index.ts";

type Run = { text: string; marks?: MarkJSON[] };

function runs(content: string | readonly Run[]): TextJSON[] {
  return typeof content === "string"
    ? [{ type: "text", text: content }]
    : content.map((run) => ({ type: "text", ...run }));
}

/** A doc of one section of one block. */
function docWith(
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

const MARK_ATTRS: Record<string, Record<string, unknown>> = {
  color: { value: "red" },
  highlight: { value: "red" },
  link: { href: "https://example.com" },
  suggest_insert: { id: "s1", author: "dana", at: 5 },
  suggest_delete: { id: "s1", author: "dana", at: 5 },
};

/** One run per mark name, each with full attributes. */
const ALL_MARKS: Run[] = MARK_NAMES.map((name) => {
  const attrs = MARK_ATTRS[name];
  return {
    text: name,
    marks: [attrs ? { type: name, attrs } : { type: name }],
  };
});

const ID = "b000000000000004";

/** The code and severity of every issue. */
const found = (json: unknown) =>
  validateDoc(json).map((issue) => [issue.code, issue.severity]);

test("a well-formed script has no issues", () => {
  const blocks: BlockJSON[] = BLOCK_TYPES.flatMap((type, i) =>
    (type === "act_break" ? ACT_BREAK_KINDS : [null]).map((kind, k) => ({
      type: "block",
      attrs: {
        ...DEFAULT_BLOCK_ATTRS,
        id: `b${String(i * 10 + k).padStart(15, "0")}`,
        type,
        kind,
      },
      content: runs(ALL_MARKS),
    })),
  );
  expect(validateDoc(sectionize(blocks, 7))).toEqual([]);
});

test("each kind of damage is named, with its severity", () => {
  const cases: [label: string, json: unknown, code: IssueCode][] = [
    ["not a doc", 42, "not_a_doc"],
    ["a doc of another name", { type: "page" }, "not_a_doc"],
    [
      "an unknown node",
      {
        type: "doc",
        content: [{ type: "section", content: [{ type: "page" }] }],
      },
      "unknown_node",
    ],
    [
      "a block inside a block",
      {
        type: "doc",
        content: [
          {
            type: "section",
            content: [
              {
                type: "block",
                attrs: { id: ID },
                content: [{ type: "block", attrs: { id: "b000000000000009" } }],
              },
            ],
          },
        ],
      },
      "non_text_content",
    ],
    [
      "text directly in a section",
      {
        type: "doc",
        content: [{ type: "section", content: [{ type: "text", text: "x" }] }],
      },
      "non_text_content",
    ],
    [
      "text directly in the doc",
      { type: "doc", content: [{ type: "text", text: "x" }] },
      "non_text_content",
    ],
    [
      "dual in the middle",
      docWith({ id: ID, dual: "middle" as never }, "x"),
      "bad_attr",
    ],
    [
      "omitted as a word",
      docWith({ id: ID, omitted: "yes" as never }, "x"),
      "bad_attr",
    ],
    ["a negative indent", docWith({ id: ID, indent: -1 }, "x"), "bad_attr"],
    ["a fractional width", docWith({ id: ID, width: 1.5 }, "x"), "bad_attr"],
    [
      "an unknown act break",
      docWith(
        { id: ID, type: "act_break", kind: "intermission" as never },
        "x",
      ),
      "bad_attr",
    ],
    [
      "a split marker without a colon",
      docWith({ id: ID, from: "nocolon" }, "x"),
      "bad_attr",
    ],
    [
      "an object as a value",
      docWith({ id: ID, suggest: {} as never }, "x"),
      "bad_attr",
    ],
    [
      "a list as a value",
      docWith({ id: ID, synopsis: [] as never }, "x"),
      "bad_attr",
    ],
    [
      "an element name out of shape",
      docWith({ id: ID, type: "Scene Heading" }, "x"),
      "bad_attr",
    ],
    ["an ID out of shape", docWith({ id: "short" }, "x"), "bad_attr"],
    ["empty text", docWith({ id: ID }, ""), "bad_attr"],
    [
      "text that is not a string",
      docWith({ id: ID }, [{ text: 7 as never }]),
      "bad_attr",
    ],
    [
      "a suggestion at a word",
      docWith({ id: ID }, [
        {
          text: "x",
          marks: [
            {
              type: "suggest_insert",
              attrs: { id: "s1", author: "dana", at: "yesterday" },
            },
          ],
        },
      ]),
      "bad_mark",
    ],
    [
      "marks that are not a list",
      docWith({ id: ID }, [{ text: "x", marks: "bold" as never }]),
      "bad_mark",
    ],
    [
      "the same mark twice",
      docWith({ id: ID }, [
        { text: "x", marks: [{ type: "bold" }, { type: "bold" }] },
      ]),
      "bad_mark",
    ],
    ["no ID", docWith({ id: null }, "x"), "missing_id"],
    ["an absent ID", docWith({}, "x"), "missing_id"],
    [
      "an element from a newer build",
      docWith({ id: ID, type: "future_thing" }, "x"),
      "unknown_type",
    ],
    [
      "an attribute from a newer build",
      docWith({ id: ID, glow: 3 }, "x"),
      "unknown_attr",
    ],
    [
      "a mark attribute from a newer build",
      docWith({ id: ID }, [
        { text: "x", marks: [{ type: "bold", attrs: { weight: 9 } }] },
      ]),
      "unknown_attr",
    ],
    [
      "a section attribute from a newer build",
      {
        type: "doc",
        content: [
          {
            type: "section",
            attrs: { tint: 1 },
            content: docWith({ id: ID }, "x").content![0]!.content,
          },
        ],
      },
      "unknown_attr",
    ],
    [
      "a mark from a newer build",
      docWith({ id: ID }, [{ text: "x", marks: [{ type: "blink" }] }]),
      "unknown_mark",
    ],
    [
      "a phone link",
      docWith({ id: ID }, [
        {
          text: "x",
          marks: [{ type: "link", attrs: { href: "tel:+15551234" } }],
        },
      ]),
      "unsafe_link",
    ],
    [
      "a script link",
      docWith({ id: ID }, [
        {
          text: "x",
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
        },
      ]),
      "unsafe_link",
    ],
    [
      "the same ID twice",
      sectionize([
        { type: "block", attrs: { id: ID }, content: runs("a") },
        { type: "block", attrs: { id: ID }, content: runs("b") },
      ]),
      "duplicate_id",
    ],
    [
      "a section with no blocks",
      { type: "doc", content: [{ type: "section", content: [] }] },
      "empty_section",
    ],
    ["a doc with no sections", { type: "doc", content: [] }, "empty_doc"],
  ];
  const severity: Record<IssueCode, Severity> = {
    not_a_doc: "reject",
    unknown_node: "reject",
    non_text_content: "reject",
    bad_attr: "reject",
    bad_mark: "reject",
    missing_id: "reject",
    unknown_type: "newer",
    unknown_attr: "newer",
    unknown_mark: "newer",
    unsafe_link: "repair",
    duplicate_id: "repair",
    empty_section: "repair",
    empty_doc: "repair",
  };
  for (const [label, json, code] of cases)
    expect({ label, issues: found(json) }).toEqual({
      label,
      issues: [[code, severity[code]]],
    });
});

test("an issue names where it is", () => {
  const doc = sectionize([
    { type: "block", attrs: { id: "b000000000000006" }, content: runs("a") },
    {
      type: "block",
      attrs: { id: ID, dual: "middle" as never },
      content: runs([{ text: "b", marks: [{ type: "blink" }] }]),
    },
  ]);
  expect(validateDoc(doc).map((issue) => issue.path)).toEqual([
    "content[0].content[1].attrs.dual",
    "content[0].content[1].content[0].marks[0]",
  ]);
});

const sug = (id: string, author: string) => ({
  type: "suggest_insert",
  attrs: { id, author, at: 5 },
});
const raw = (marks: unknown[]) => ({
  type: "doc",
  attrs: {},
  content: [
    {
      type: "section",
      attrs: {},
      content: [
        {
          type: "block",
          attrs: {
            id: "b000000000000005",
            type: "action",
            omitted: false,
            synopsis: "",
            noContd: false,
            noTiming: false,
          },
          content: [{ type: "text", text: "Rain", marks }],
        },
      ],
    },
  ],
});

test("the raw shape is read as it comes", () => {
  // two overlapping marks, one name
  expect(validateDoc(raw([sug("s1", "dana"), sug("s2", "sam")]))).toEqual([]);
  // the storage suffix is removed before a mark reaches this shape; validateDoc does not strip it
  expect(
    validateDoc(raw([{ type: "suggest_insert--VVzy7IIk", attrs: {} }])).map(
      (i) => i.code,
    ),
  ).toEqual(["unknown_mark"]);
  expect(validateDoc(raw([{ type: "bold", attrs: {} }]))).toEqual([]);
});

test("validation never throws, whatever it is given", () => {
  fc.assert(
    fc.property(fc.anything(), (value) => {
      validateDoc(value);
      validateDoc({ type: "doc", content: [value] });
      validateDoc({
        type: "doc",
        content: [{ type: "section", content: [value] }],
      });
      validateDoc(
        docWith({ id: ID, type: "action" }, [
          { text: "x", marks: [value as MarkJSON] },
        ]),
      );
    }),
  );
});

test("only structural damage rejects", () => {
  expect(
    rejects(
      validateDoc(
        docWith({ id: ID, type: "action" }, [
          {
            text: "call",
            marks: [{ type: "link", attrs: { href: "tel:+15551234" } }],
          },
        ]),
      ),
    ),
  ).toBe(false);
  expect(
    rejects(validateDoc(docWith({ id: ID, type: "future_thing" }, "x"))),
  ).toBe(false);
  expect(rejects(validateDoc(docWith({ id: null, type: "action" }, "x")))).toBe(
    true,
  );
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
const docArb: fc.Arbitrary<DocJSON> = fc.record({
  type: fc.constant("doc" as const),
  content: fc.array(
    fc.record({
      type: fc.constant("section" as const),
      content: fc.array(blockArb, { maxLength: 3 }),
    }),
    { maxLength: 4 },
  ),
});

const ids = () => "f1f1f1f1f1f1f1f1";

test("normalising drops empty sections, fills an empty document, removes unsafe links, and is idempotent", () => {
  expect(normalizeDoc({ type: "doc", content: [] }, ids)).toEqual({
    type: "doc",
    content: [
      {
        type: "section",
        content: [
          {
            type: "block",
            attrs: { ...DEFAULT_BLOCK_ATTRS, id: "f1f1f1f1f1f1f1f1" },
          },
        ],
      },
    ],
  });

  const tel: MarkJSON = { type: "link", attrs: { href: "tel:+15551234" } };
  const web: MarkJSON = {
    type: "link",
    attrs: { href: "https://example.com" },
  };
  const doc: DocJSON = {
    type: "doc",
    content: [
      { type: "section", content: [] },
      {
        type: "section",
        content: [
          {
            type: "block",
            attrs: { id: ID },
            content: runs([
              { text: "call", marks: [{ type: "bold" }, tel] },
              { text: "site", marks: [web] },
            ]),
          },
        ],
      },
    ],
  };
  expect(normalizeDoc(doc, ids)).toEqual({
    type: "doc",
    content: [
      {
        type: "section",
        content: [
          {
            type: "block",
            attrs: { id: ID },
            content: runs([
              { text: "call", marks: [{ type: "bold" }] },
              { text: "site", marks: [web] },
            ]),
          },
        ],
      },
    ],
  });

  fc.assert(
    fc.property(docArb, (d) => {
      const n = normalizeDoc(d, ids);
      parseDoc(n);
      expect(normalizeDoc(n, ids)).toEqual(n);
      const repairs = validateDoc(n).filter(
        (issue) => issue.code !== "duplicate_id",
      );
      expect(repairs).toEqual([]);
    }),
  );
});

const blocks = (count: number): BlockJSON[] =>
  Array.from({ length: count }, (_, i) => ({
    type: "block",
    attrs: { id: `b${String(i).padStart(15, "0")}` },
  }));
const sizes = (json: DocJSON) =>
  (json.content ?? []).map((section) => section.content?.length);
test("sectionize makes even sections and never drops a block", () => {
  const all = blocks(250);
  const doc = sectionize(all);
  expect(sizes(doc)).toEqual([84, 83, 83]);
  expect(
    (doc.content ?? []).flatMap((section) => section.content ?? []),
  ).toEqual(all);
  expect(sectionize([])).toEqual({ type: "doc", content: [] });
  expect(sizes(sectionize(blocks(100)))).toEqual([100]);
  expect(sizes(sectionize(blocks(101)))).toEqual([51, 50]);
  expect(sizes(sectionize(blocks(5), 2))).toEqual([2, 2, 1]);
  expect(() => sectionize(all, 0)).toThrow(RangeError);
});
