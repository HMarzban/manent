import { expect, test } from "bun:test";
import {
  DEFAULT_BLOCK_ATTRS,
  blockText,
  blockView,
  blocksOf,
  canonicalDoc,
  parseDoc,
} from "../src/index.ts";
import type { BlockJSON, DocJSON } from "../src/index.ts";

const json: DocJSON = {
  type: "doc",
  content: [
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: { id: "a".repeat(16), type: "character" },
          content: [{ type: "text", text: "JANE" }],
        },
      ],
    },
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: { id: "b".repeat(16), type: "dialogue", dual: "left" },
          content: [
            { type: "text", text: "Rain " },
            {
              type: "text",
              text: "hard",
              marks: [{ type: "caps" }, { type: "blink" }, { type: "bold" }],
            },
          ],
        },
        { type: "block", attrs: { id: "c".repeat(16) } },
      ],
    },
  ],
};

test("the blocks of a document, in order, as plain data", () => {
  const flat = blocksOf(json);
  expect(
    flat.map((b) => [
      b.section,
      b.index,
      b.attrs.id,
      b.attrs.type,
      blockText(b),
    ]),
  ).toEqual([
    [0, 0, "a".repeat(16), "character", "JANE"],
    [1, 1, "b".repeat(16), "dialogue", "Rain hard"],
    [1, 2, "c".repeat(16), "action", ""],
  ]);
  expect(flat[1]!.attrs).toEqual({
    ...DEFAULT_BLOCK_ATTRS,
    id: "b".repeat(16),
    type: "dialogue",
    dual: "left",
  });
  expect(flat[1]!.runs).toEqual([
    { text: "Rain ", marks: [] },
    { text: "hard", marks: ["bold", "caps", "blink"] },
  ]);
  expect(flat[2]!.runs).toEqual([]);
});

test("a ProseMirror document and its JSON give the same view", () => {
  const known: DocJSON = canonicalDoc(parseDoc(json).toJSON()); // what this build can hold: the unknown mark is gone
  expect(blocksOf(parseDoc(json))).toEqual(blocksOf(known));
});

test("a view is frozen and keeps nothing of its input", () => {
  const block: BlockJSON = {
    type: "block",
    attrs: { id: "d".repeat(16) },
    content: [{ type: "text", text: "x", marks: [{ type: "bold" }] }],
  };
  const view = blockView(block);
  block.content![0]!.text = "changed";
  expect(blockText(view)).toBe("x");
  expect([
    Object.isFrozen(view),
    Object.isFrozen(view.attrs),
    Object.isFrozen(view.runs),
    Object.isFrozen(view.runs[0]),
    Object.isFrozen(view.runs[0]!.marks),
  ]).toEqual([true, true, true, true, true]);
});

test("a block whose attribute holds a wrong value is refused, not given a type it does not have", () => {
  expect(() =>
    blockView({
      type: "block",
      attrs: { id: "e".repeat(16), dual: "middle" as "left" },
    }),
  ).toThrow(TypeError);
});
