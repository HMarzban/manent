import { expect, test } from "bun:test";
import {
  DEFAULT_BLOCK_ATTRS,
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
