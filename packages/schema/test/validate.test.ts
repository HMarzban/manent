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
} from "../src/index.ts";
import { ALL_MARKS, ID, docWith, ids, runs } from "./helpers.ts";

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
              attrs: { id: "s1", authorUserId: "dana", at: "yesterday" },
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
    [
      "the same suggestion twice, once with a default left out",
      docWith({ id: ID }, [
        {
          text: "x",
          marks: [
            {
              type: "suggest_insert",
              attrs: { id: "s1", authorUserId: "d", at: 0 },
            },
            { type: "suggest_insert", attrs: { id: "s1", authorUserId: "d" } },
          ],
        },
      ]),
      "bad_mark",
    ],
    [
      "a mark on a block",
      {
        type: "doc",
        content: [
          {
            type: "section",
            content: [
              {
                type: "block",
                attrs: { id: ID },
                marks: [{ type: "bold" }],
                content: runs("x"),
              },
            ],
          },
        ],
      },
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

const sug = (id: string, authorUserId: string) => ({
  type: "suggest_insert",
  attrs: { id, authorUserId, at: 5 },
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

// Scripts that are nearly right: every field is usually a good value and
// sometimes anything at all, and the good values come from small pools so
// that repeated IDs and repeated marks are common.
const anyValue = fc.oneof(
  fc.constantFrom(undefined, null, true, false, 0, -1, 1.5, "", {}, []),
  fc.anything(),
);
const maybe = <T>(good: fc.Arbitrary<T>): fc.Arbitrary<unknown> =>
  fc.oneof({ arbitrary: good, weight: 30 }, { arbitrary: anyValue, weight: 1 });
const word = fc.constantFrom("s1", "s2", "d", "");
const nearMark = fc.record(
  {
    type: maybe(fc.constantFrom(...MARK_NAMES, "blink")),
    attrs: maybe(
      fc.record(
        {
          id: maybe(word),
          authorUserId: maybe(word),
          at: maybe(fc.constantFrom(0, 1)),
          value: maybe(word),
          href: maybe(fc.constantFrom("https://example.com", "tel:+15551234")),
          rate: anyValue,
        },
        { requiredKeys: [] },
      ),
    ),
  },
  { requiredKeys: ["type"] },
);
// Suggestions drawn from values equal to their defaults, given or left out,
// so that two marks equal only once defaults are filled in are common.
const nearSuggestion = fc.record({
  type: fc.constantFrom("suggest_insert", "suggest_delete"),
  attrs: fc.record(
    {
      id: fc.constantFrom("", "s1"),
      authorUserId: fc.constantFrom("", "d"),
      at: fc.constantFrom(0, 1),
    },
    { requiredKeys: [] },
  ),
});
/** Usually `usual`, now and then `odd`. */
const mostly = <T, U>(usual: fc.Arbitrary<T>, odd: fc.Arbitrary<U>) =>
  fc.oneof({ arbitrary: usual, weight: 20 }, { arbitrary: odd, weight: 1 });
const nearNode = (
  type: string,
  attrs: fc.Arbitrary<unknown>,
  child: fc.Arbitrary<unknown>,
) =>
  fc.record(
    {
      type: mostly(
        fc.constant(type),
        fc.constantFrom("doc", "section", "block", "text", "page"),
      ),
      attrs: maybe(attrs),
      content: maybe(fc.array(child, { maxLength: 3 })),
      text: maybe(fc.string({ minLength: 1, maxLength: 3 })),
      // only text carries marks; elsewhere they are a rare mistake
      marks:
        type === "text"
          ? maybe(
              fc.oneof(
                fc.array(nearMark, { maxLength: 3 }),
                fc.array(nearSuggestion, { minLength: 2, maxLength: 3 }),
                fc.array(fc.oneof(nearMark, nearSuggestion), {
                  minLength: 2,
                  maxLength: 3,
                }),
              ),
            )
          : mostly(fc.constant([]), fc.array(nearMark, { maxLength: 1 })),
    },
    { requiredKeys: ["type"] },
  );
const nearBlockAttrs = fc.record(
  {
    id: maybe(fc.constantFrom("b000000000000007", "b000000000000008")),
    type: maybe(fc.constantFrom(...BLOCK_TYPES, "future_thing")),
    dual: maybe(fc.constantFrom(null, "left", "right")),
    indent: maybe(fc.constantFrom(null, 0, 4)),
    glow: anyValue,
  },
  { requiredKeys: ["id"] },
);
const nearDoc = nearNode(
  "doc",
  fc.constant({}),
  nearNode(
    "section",
    fc.constant({}),
    nearNode(
      "block",
      nearBlockAttrs,
      nearNode("text", fc.constant({}), anyValue),
    ),
  ),
);

test("whatever validation does not reject, every client can read once normalised", () => {
  fc.assert(
    fc.property(fc.oneof(nearDoc, anyValue), (input) => {
      if (rejects(validateDoc(input))) return;
      parseDoc(normalizeDoc(input as DocJSON, ids));
    }),
    { numRuns: 5000 },
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
