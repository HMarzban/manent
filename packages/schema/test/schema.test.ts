import { expect, test } from "bun:test";
import {
  ACT_BREAK_KINDS,
  BLOCK_TYPES,
  DEFAULT_BLOCK_ATTRS,
  FORMAT_ELEMENTS,
  MARK_NAMES,
  fillBlockAttrs,
  isSafeHref,
  parseDoc,
  renderedType,
  schema,
} from "../src/index.ts";
import type {
  BlockJSON,
  BlockType,
  DocJSON,
  MarkJSON,
  TextJSON,
} from "../src/index.ts";

type Run = { text: string; marks?: MarkJSON[] };

/** A doc of one section of one block. */
function docWith(
  attrs: BlockJSON["attrs"],
  content: string | readonly Run[],
): DocJSON {
  const runs: TextJSON[] =
    typeof content === "string"
      ? [{ type: "text", text: content }]
      : content.map((run) => ({ type: "text", ...run }));
  return {
    type: "doc",
    content: [
      { type: "section", content: [{ type: "block", attrs, content: runs }] },
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

/** The same doc with every block attribute filled. */
function withDefaults(json: DocJSON): DocJSON {
  return {
    ...json,
    content: json.content?.map((section) => ({
      ...section,
      content: section.content?.map((block) => ({
        ...block,
        attrs: { ...DEFAULT_BLOCK_ATTRS, ...block.attrs },
      })),
    })),
  };
}

test("the document is doc → section+ → block+ → text*", () => {
  expect(Object.keys(schema.nodes)).toEqual([
    "doc",
    "section",
    "block",
    "text",
  ]);
  expect(schema.nodes.doc.spec.content).toBe("section+");
  expect(schema.nodes.section.spec.content).toBe("block+");
  expect(schema.nodes.block.spec.content).toBe("text*");
});

test("every attribute of every node and mark has a default, and block attributes are scalars", () => {
  expect(schema.nodes.block.create().attrs).toEqual(DEFAULT_BLOCK_ATTRS);
  for (const type of [
    ...Object.values(schema.nodes),
    ...Object.values(schema.marks),
  ])
    for (const attr of Object.values(type.spec.attrs ?? {}))
      expect(attr).toHaveProperty("default");
  for (const value of Object.values(DEFAULT_BLOCK_ATTRS))
    expect(value === null || typeof value !== "object").toBe(true);
});

test("no node needs more than one child", () => {
  expect(schema.topNodeType.createAndFill()!.toJSON()).toEqual({
    type: "doc",
    content: [
      {
        type: "section",
        content: [{ type: "block", attrs: DEFAULT_BLOCK_ATTRS }],
      },
    ],
  });
});

test("every element of every format round-trips through JSON", () => {
  for (const type of BLOCK_TYPES)
    for (const kind of type === "act_break" ? ACT_BREAK_KINDS : [null]) {
      const json = docWith({ id: "b000000000000001", type, kind }, ALL_MARKS);
      expect(parseDoc(json).toJSON()).toEqual(withDefaults(json));
    }
});

test("an unknown element is kept and renders as General", () => {
  const doc = parseDoc(
    docWith({ id: "b000000000000002", type: "future_thing" }, "x"),
  );
  expect(doc.firstChild!.firstChild!.attrs.type).toBe("future_thing");
  expect(renderedType("future_thing")).toBe("general");
  expect(schema.nodes.block.spec.toDOM!(doc.firstChild!.firstChild!)).toEqual([
    "p",
    {
      class: "el el-general",
      "data-type": "future_thing",
      "data-id": "b000000000000002",
    },
    0,
  ]);
  expect(schema.nodes.section.spec.toDOM!(doc.firstChild!)).toEqual([
    "div",
    { class: "section" },
    0,
  ]);
});

test("a block without an ID renders without data-id", () => {
  const block = schema.nodes.block.create({ type: "dialogue" });
  expect(schema.nodes.block.spec.toDOM!(block)).toEqual([
    "p",
    { class: "el el-dialogue", "data-type": "dialogue" },
    0,
  ]);
});

test("a mark or attribute from a newer build does not stop this one reading the script", () => {
  const json = docWith({ id: "b000000000000003", type: "action", glow: 3 }, [
    {
      text: "Rain",
      marks: [{ type: "blink", attrs: { rate: 2 } }, { type: "bold" }],
    },
  ]);
  const doc = parseDoc(json); // no throw
  expect(doc.textContent).toBe("Rain");
  expect(
    doc.firstChild!.firstChild!.firstChild!.marks.map((m) => m.type.name),
  ).toEqual(["bold"]);
});

test("filling block attributes keeps given values as they are, fills missing keys and drops unknown ones", () => {
  const filled: unknown = fillBlockAttrs({
    type: "dialogue",
    omitted: "yes",
    glow: 3,
  });
  expect(filled).toEqual({
    ...DEFAULT_BLOCK_ATTRS,
    type: "dialogue",
    omitted: "yes",
  });
  expect(fillBlockAttrs()).toEqual(DEFAULT_BLOCK_ATTRS);
});

test("bad structure throws a RangeError", () => {
  expect(() => parseDoc({ type: "doc", content: [] })).toThrow(RangeError);
  expect(() =>
    parseDoc({
      type: "doc",
      content: [{ type: "section", content: [{ type: "page" }] }],
    } as unknown as DocJSON),
  ).toThrow(RangeError);
});

test("format element sets", () => {
  const all: BlockType[] = ["act_break", "group", "page_break"];
  const base: BlockType[] = [
    "scene_heading",
    "action",
    "character",
    "parenthetical",
    "dialogue",
    "transition",
    "shot",
    "general",
  ];
  expect(FORMAT_ELEMENTS.screenplay).toEqual([...base, ...all]);
  expect(FORMAT_ELEMENTS.multicam).toEqual(FORMAT_ELEMENTS.screenplay);
  expect(FORMAT_ELEMENTS.animation).toEqual(FORMAT_ELEMENTS.screenplay);
  expect(FORMAT_ELEMENTS.variety).toEqual([
    "slug",
    "bracket",
    "character",
    "parenthetical",
    "dialogue",
    "transition",
    "shot",
    "general",
    ...all,
  ]);
  expect(FORMAT_ELEMENTS.game).toEqual([
    ...base,
    "emote",
    "camera",
    "engine",
    ...all,
  ]);
  expect(FORMAT_ELEMENTS.ink).toEqual(["ink_line", ...all]);
  expect(FORMAT_ELEMENTS.manuscript).toEqual([
    "chapter",
    "body",
    "break",
    "quote",
    ...all,
  ]);
  // every element belongs to a format
  expect(new Set(Object.values(FORMAT_ELEMENTS).flat())).toEqual(
    new Set(BLOCK_TYPES),
  );
});

test("two people's suggestions overlap on the same text", () => {
  const a = schema.marks.suggest_insert.create({
    id: "s1",
    author: "dana",
    at: 5,
  });
  const b = schema.marks.suggest_insert.create({
    id: "s2",
    author: "sam",
    at: 6,
  });
  expect(a.addToSet([b])).toHaveLength(2);
  expect(
    schema.marks.bold.create().addToSet([schema.marks.bold.create()]),
  ).toHaveLength(1);
  // order is part of the stored key
  expect(Object.keys(a.attrs)).toEqual(["id", "author", "at"]);
});

test("a link never renders a script address", () => {
  expect(isSafeHref("https://example.com")).toBe(true);
  for (const href of [
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "tel:+15551234",
    "data:text/html,x",
  ])
    expect(isSafeHref(href)).toBe(false);
  const dom = schema.marks.link.spec.toDOM!(
    schema.marks.link.create({ href: "javascript:alert(1)" }),
    true,
  ) as readonly unknown[];
  expect(dom[1]).not.toHaveProperty("href");
});
