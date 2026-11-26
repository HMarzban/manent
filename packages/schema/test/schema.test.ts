import { expect, test } from "bun:test";
import {
  BLOCK_TYPES,
  DEFAULT_BLOCK_ATTRS,
  FORMATS,
  NODE_NAMES,
  SCHEMA_VERSION,
  parseDoc,
  renderedType,
  schema,
} from "../src/index.ts";
import { docWith } from "./helpers.ts";

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

const attrsOf = (spec: { attrs?: Record<string, { default?: unknown }> }) =>
  Object.entries(spec.attrs ?? {}).map(([name, a]) => [name, a.default]);
test("the schema's shape is version 3; a change to this snapshot means raising SCHEMA_VERSION", () => {
  expect(SCHEMA_VERSION).toBe(3);
  const nodes = Object.fromEntries(
    NODE_NAMES.map((n) => [
      n,
      [
        schema.nodes[n].spec.content ?? null,
        schema.nodes[n].spec.marks ?? null,
        attrsOf(schema.nodes[n].spec),
      ],
    ]),
  );
  expect(nodes).toEqual({
    doc: ["section+", null, []],
    section: ["block+", null, []],
    block: [
      "text*",
      "_",
      [
        ["id", null],
        ["type", "action"],
        ["num", null],
        ["omitted", false],
        ["dual", null],
        ["synopsis", ""],
        ["align", null],
        ["indent", null],
        ["width", null],
        ["spaceBefore", null],
        ["noContd", false],
        ["noTiming", false],
        ["writerUserId", null],
        ["suggest", null],
        ["from", null],
        ["kind", null],
        ["suggestId", null],
        ["suggestAuthorUserId", null],
        ["suggestAt", null],
        ["tags", []],
        ["linkTo", null],
        ["graphic", null],
      ],
    ],
    text: [null, null, []],
  });
  expect(
    Object.keys(schema.marks).map((m) => [m, attrsOf(schema.marks[m]!.spec)]),
  ).toEqual([
    ["bold", []],
    ["italic", []],
    ["underline", []],
    ["strike", []],
    ["caps", []],
    ["color", [["value", ""]]],
    ["highlight", [["value", ""]]],
    ["link", [["href", ""]]],
    [
      "suggest_insert",
      [
        ["id", ""],
        ["authorUserId", ""],
        ["at", 0],
      ],
    ],
    [
      "suggest_delete",
      [
        ["id", ""],
        ["authorUserId", ""],
        ["at", 0],
      ],
    ],
  ]);
  expect(FORMATS).toEqual([
    "screenplay",
    "multicam",
    "animation",
    "variety",
    "game",
    "ink",
    "manuscript",
    "stage_play",
  ]);
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

test("two people's suggestions overlap on the same text", () => {
  const a = schema.marks.suggest_insert.create({
    id: "s1",
    authorUserId: "dana",
    at: 5,
  });
  const b = schema.marks.suggest_insert.create({
    id: "s2",
    authorUserId: "sam",
    at: 6,
  });
  expect(a.addToSet([b])).toHaveLength(2);
  expect(
    schema.marks.bold.create().addToSet([schema.marks.bold.create()]),
  ).toHaveLength(1);
  // order is part of the stored key
  expect(Object.keys(a.attrs)).toEqual(["id", "authorUserId", "at"]);
});

const dom = (type: string) =>
  schema.nodes.block.spec.toDOM!(
    schema.nodes.block.create({ id: "b000000000000001", type }),
  ) as [string, Record<string, string>];
test("spelling is off on headings and cues and nowhere else", () => {
  expect(BLOCK_TYPES.filter((t) => dom(t)[1].spellcheck === "false")).toEqual([
    "scene_heading",
    "character",
    "slug",
  ]);
});
