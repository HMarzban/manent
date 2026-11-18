import { expect, test } from "bun:test";
import {
  SECTION_TARGET_BLOCKS,
  canonicalDoc,
  sectionize,
} from "@manent/schema";
import type { MarkJSON } from "@manent/schema";
import * as Y from "yjs";
import {
  scriptBody,
  scriptDocFromJSON,
  yXmlFragmentForBinding,
} from "../src/index.ts";
import type { CrdtDoc } from "../src/index.ts";
import {
  FIRST_ID,
  ID,
  SAMPLE,
  SECOND_ID,
  THIRD_ID,
  block,
  bodyBlockIds,
  docWith,
  idOf,
  pasted,
  runs,
  sectionSizes,
  textOf,
} from "./helpers.ts";

function yBlock(doc: CrdtDoc): Y.XmlElement {
  const section = yXmlFragmentForBinding(doc).get(0);
  const child = section instanceof Y.XmlElement ? section.get(0) : null;
  if (!(child instanceof Y.XmlElement))
    throw new RangeError("the first section holds no block");
  return child;
}

function stateVector(doc: CrdtDoc): Uint8Array {
  const ydoc = yXmlFragmentForBinding(doc).doc;
  if (ydoc === null)
    throw new RangeError("the fragment belongs to no document");
  return Y.encodeStateVector(ydoc);
}

/** A suggestion of its own by this author. */
function by(authorUserId: string): MarkJSON {
  return {
    type: "suggest_insert",
    attrs: { id: authorUserId, authorUserId, at: 5 },
  };
}

test("a block is inserted after its anchor, in the anchor's section", () => {
  const doc = scriptDocFromJSON(SAMPLE);
  scriptBody(doc).write((w) =>
    w.insertBlocks(FIRST_ID, [block("n".repeat(16), "new")]),
  );
  expect(sectionSizes(doc)).toEqual([4, 3]);
  expect(bodyBlockIds(doc).slice(0, 4)).toEqual([
    FIRST_ID,
    "n".repeat(16),
    SECOND_ID,
    THIRD_ID,
  ]);
});

test("at the very start one block joins the first section, and a paste gets sections of its own", () => {
  const doc = scriptDocFromJSON({ type: "doc" });
  const body = scriptBody(doc);
  body.write((w) => w.insertBlocks(null, [block(idOf(0), "first")]));
  expect(sectionSizes(doc)).toEqual([1]);
  body.write((w) => w.insertBlocks(null, [block(idOf(1), "before it")]));
  expect(sectionSizes(doc)).toEqual([2]);
  body.write((w) => w.insertBlocks(null, pasted(SECTION_TARGET_BLOCKS + 1)));
  expect(sectionSizes(doc)).toEqual([SECTION_TARGET_BLOCKS, 1, 2]);
  expect(bodyBlockIds(doc).slice(-2)).toEqual([idOf(1), idOf(0)]);
});

test("a full section is never grown at its end, and no existing block moves", () => {
  const blocks = Array.from({ length: SECTION_TARGET_BLOCKS }, (_, i) =>
    block(idOf(i), `line ${i}`),
  );
  const doc = scriptDocFromJSON(sectionize(blocks));
  const body = scriptBody(doc);
  body.write((w) =>
    w.insertBlocks(idOf(SECTION_TARGET_BLOCKS - 1), [
      block("n".repeat(16), "new"),
    ]),
  );
  expect(sectionSizes(doc)).toEqual([SECTION_TARGET_BLOCKS, 1]);
  body.write((w) => w.insertBlocks(idOf(0), [block("m".repeat(16), "mid")]));
  expect(sectionSizes(doc)).toEqual([SECTION_TARGET_BLOCKS + 1, 1]);
});

test("a paste at the end of a section gets sections of its own; in the middle it stays in the section", () => {
  const doc = scriptDocFromJSON(
    sectionize([block(idOf(0), "a"), block(idOf(1), "b")]),
  );
  const body = scriptBody(doc);
  body.write((w) => w.insertBlocks(idOf(1), pasted(250)));
  expect(sectionSizes(doc)).toEqual([2, 100, 100, 50]);
  body.write((w) => w.insertBlocks(idOf(0), pasted(3)));
  expect(sectionSizes(doc)).toEqual([5, 100, 100, 50]); // b stays where it was
  expect(bodyBlockIds(doc).indexOf(idOf(1))).toBe(4);
});

test("deleting the last block of a section deletes the section", () => {
  const doc = scriptDocFromJSON(
    sectionize([block(idOf(0), "a"), block(idOf(1), "b")], 1),
  );
  const body = scriptBody(doc);
  body.write((w) => w.deleteBlock(idOf(0)));
  expect(sectionSizes(doc)).toEqual([1]);
  body.write((w) => w.deleteBlock(idOf(1)));
  expect(body.materialize()).toEqual({ type: "doc" });
});

test("changing an element is one attribute and keeps the text", () => {
  const doc = scriptDocFromJSON(docWith({ id: ID, type: "action" }, "Rain"));
  const before = yBlock(doc).getAttributes();
  scriptBody(doc).write((w) => w.setBlockAttrs(ID, { type: "character" }));
  expect(yBlock(doc).getAttributes()).toEqual({ ...before, type: "character" });
  expect(textOf(doc, ID)).toBe("Rain");
});

test("a null attribute is removed, not stored", () => {
  const doc = scriptDocFromJSON(docWith({ id: ID, type: "dialogue" }, "Hello"));
  const before = yBlock(doc).getAttributes();
  const body = scriptBody(doc);
  body.write((w) => w.setBlockAttrs(ID, { dual: "left" }));
  expect(yBlock(doc).getAttributes()).toEqual({ ...before, dual: "left" });
  body.write((w) => w.setBlockAttrs(ID, { dual: null }));
  expect(yBlock(doc).getAttributes()).toEqual(before);
});

test("text inserted with no marks inside a suggested run is plain", () => {
  const sug = {
    type: "suggest_insert",
    attrs: { id: "s1", authorUserId: "dana", at: 5 },
  };
  const doc = scriptDocFromJSON(
    docWith({ id: ID, type: "action" }, [
      { text: "abcdef", marks: [sug, { type: "bold" }] },
    ]),
  );
  const body = scriptBody(doc);
  body.write((w) => w.insertText(ID, 3, "X"));
  body.write((w) => w.insertText(ID, 4, "Y", [{ type: "bold" }]));
  expect(runs(doc, ID)).toEqual([
    ["abc", ["bold", "suggest_insert"]],
    ["X", []],
    ["Y", ["bold"]],
    ["def", ["bold", "suggest_insert"]],
  ]);
});

test("an offset inside a surrogate pair moves to its start", () => {
  const doc = scriptDocFromJSON(docWith({ id: ID, type: "action" }, "ab🎬cd"));
  const body = scriptBody(doc);
  body.write((w) => w.insertText(ID, 3, "X"));
  expect(textOf(doc, ID)).toBe("abX🎬cd");
  body.write((w) => w.deleteText(ID, 4, 1));
  expect(textOf(doc, ID)).toBe("abXcd"); // the whole character, never half
  body.write((w) => w.insertText(ID, 999, "!"));
  expect(textOf(doc, ID)).toBe("abXcd!");
});

test("text typed into one block by two people at once is one text, written where the offset falls", () => {
  const doc = scriptDocFromJSON(docWith({ id: ID, type: "action" }, "abc"));
  yBlock(doc).insert(1, [new Y.XmlText("def")]);
  const body = scriptBody(doc);
  body.write((w) => w.insertText(ID, 4, "X"));
  body.write((w) => w.deleteText(ID, 2, 2));
  body.write((w) => w.addMark(ID, 1, 3, { type: "bold" }));
  expect(runs(doc, ID)).toEqual([
    ["a", []],
    ["bXe", ["bold"]],
    ["f", []],
  ]);
});

test("a mark is added to existing text and nothing around it changes", () => {
  const doc = scriptDocFromJSON(docWith({ id: ID, type: "action" }, "abcdef"));
  const body = scriptBody(doc);
  body.write((w) => w.addMark(ID, 2, 2, { type: "bold" }));
  expect(runs(doc, ID)).toEqual([
    ["ab", []],
    ["cd", ["bold"]],
    ["ef", []],
  ]);
  const before = stateVector(doc);
  body.write((w) => w.addMark(ID, 2, 2, { type: "bold" }));
  expect(stateVector(doc)).toEqual(before);
  body.write((w) => {
    w.addMark(ID, 1, 4, by("dana"));
    w.addMark(ID, 2, 2, by("omar"));
  });
  expect(runs(doc, ID)).toEqual([
    ["a", []],
    ["b", ["suggest_insert"]],
    ["cd", ["bold", "suggest_insert", "suggest_insert"]],
    ["e", ["suggest_insert"]],
    ["f", []],
  ]);
});

test("writes to a block that is gone return false and change nothing", () => {
  const doc = scriptDocFromJSON(SAMPLE);
  const gone = "z".repeat(16);
  const before = stateVector(doc);
  const results: boolean[] = [];
  scriptBody(doc).write((w) => {
    results.push(
      w.insertBlocks(gone, [block(idOf(0), "new")]),
      w.deleteBlock(gone),
      w.setBlockAttrs(gone, { type: "character" }),
      w.insertText(gone, 0, "x"),
      w.deleteText(gone, 0, 1),
      w.addMark(gone, 0, 1, { type: "bold" }),
    );
  });
  expect(results).toEqual([false, false, false, false, false, false]);
  expect(stateVector(doc)).toEqual(before);
  expect(scriptBody(doc).materialize()).toEqual(canonicalDoc(SAMPLE));
});

test("a write that throws keeps what it wrote before the throw", () => {
  const doc = scriptDocFromJSON(docWith({ id: ID, type: "action" }, "Rain"));
  expect(() =>
    scriptBody(doc).write((w) => {
      w.insertText(ID, 4, " falls");
      throw new RangeError("stop");
    }),
  ).toThrow(RangeError);
  expect(textOf(doc, ID)).toBe("Rain falls");
});
