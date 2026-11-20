import { expect, spyOn, test } from "bun:test";
import { blockText, blockView, sectionize } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import * as Y from "yjs";
import {
  blockAuthors,
  readBlockExcluding,
  readBlocks,
  readStateVector,
  sceneOf,
  scriptBody,
  scriptDocFromJSON,
} from "../src/index.ts";
import { block, idOf, twoReplicasOf } from "./helpers.ts";

const FIRST_HEADING = "h000000000000001";
const ACTION = "a000000000000001";
const SECOND_HEADING = "h000000000000002";
const DIALOGUE = "d000000000000001";
const ACTION_TEXT = "Waves climb the glass.";

/** A heading with no number and its action, then a heading numbered 4A and its dialogue. */
const SAMPLE: DocJSON = {
  type: "doc",
  content: [
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: { id: FIRST_HEADING, type: "scene_heading" },
          content: [{ type: "text", text: "INT. LIGHTHOUSE - NIGHT" }],
        },
        {
          type: "block",
          attrs: { id: ACTION, type: "action" },
          content: [
            { type: "text", text: "Waves climb the " },
            { type: "text", text: "glass", marks: [{ type: "italic" }] },
            { type: "text", text: "." },
          ],
        },
      ],
    },
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: { id: SECOND_HEADING, type: "scene_heading", num: "4A" },
          content: [{ type: "text", text: "EXT. JETTY - LATER" }],
        },
        {
          type: "block",
          attrs: { id: DIALOGUE, type: "dialogue" },
          content: [{ type: "text", text: "Hold the lamp steady." }],
        },
      ],
    },
  ],
};

/** The canonical form's attributes that hold their defaults. */
const UNSET = { omitted: false, synopsis: "", noContd: false, noTiming: false };

const doc = scriptDocFromJSON(SAMPLE);

test("blocks are read by id in one pass", () => {
  const read = readBlocks(doc, new Set([ACTION, DIALOGUE, "missing"]));
  expect([...read.keys()].toSorted()).toEqual([ACTION, DIALOGUE].toSorted());
  expect([...read.values()]).toEqual([
    {
      type: "block",
      attrs: { id: ACTION, type: "action", ...UNSET },
      content: [
        { type: "text", text: "Waves climb the " },
        { type: "text", text: "glass", marks: [{ type: "italic" }] },
        { type: "text", text: "." },
      ],
    },
    {
      type: "block",
      attrs: { id: DIALOGUE, type: "dialogue", ...UNSET },
      content: [{ type: "text", text: "Hold the lamp steady." }],
    },
  ]);
});

test("a block's scene is its heading's number, or the heading's place", () => {
  expect([
    sceneOf(doc, ACTION),
    sceneOf(doc, DIALOGUE),
    sceneOf(doc, FIRST_HEADING),
    sceneOf(doc, "missing"),
  ]).toEqual(["1", "4A", "1", null]);
});

test("a block before the first scene heading is in no scene", () => {
  const opening = scriptDocFromJSON(
    sectionize([block(idOf(0), "FADE IN:"), block(idOf(1), "Rain.")]),
  );
  expect(sceneOf(opening, idOf(1))).toBe(null);
});

test("the authors of a block since a state are the clients that wrote in it after that state", () => {
  const [a, b] = twoReplicasOf(SAMPLE);
  const since = a.encodeStateVector();
  scriptBody(b).write((w) => w.insertText(ACTION, 0, "x"));
  a.applyUpdate(b.diff(a.encodeStateVector()));
  expect(blockAuthors(a, ACTION, since)).toEqual([2]);
  expect(blockAuthors(a, DIALOGUE, since)).toEqual([]);
});

test("a block's authors count its attributes and the words deleted since", () => {
  const [a, b] = twoReplicasOf(SAMPLE);
  const since = a.encodeStateVector();
  scriptBody(b).write((w) => w.insertText(ACTION, 0, "gone "));
  scriptBody(b).write((w) => w.deleteText(ACTION, 0, 5));
  a.applyUpdate(b.diff(a.encodeStateVector()));
  scriptBody(a).write((w) => w.setBlockAttrs(DIALOGUE, { omitted: true }));
  expect([
    blockAuthors(a, ACTION, since),
    blockAuthors(a, DIALOGUE, since),
  ]).toEqual([[2], [1]]);
});

test("a block can be read without one client's recent typing", () => {
  const [a, b] = twoReplicasOf(SAMPLE);
  const from = readStateVector(a.encodeStateVector()).get(1) ?? 0;
  scriptBody(a).write((w) => w.insertText(ACTION, 0, "mine "));
  scriptBody(b).write((w) => w.insertText(ACTION, 0, "theirs "));
  a.applyUpdate(b.diff(a.encodeStateVector()));
  expect(
    blockText(blockView(readBlockExcluding(a, ACTION, new Map([[1, from]]))!)),
  ).toBe("theirs " + ACTION_TEXT);
});

test("typing from before the excluded clock stays, with its marks, when one item holds both", () => {
  const [a] = twoReplicasOf(SAMPLE);
  scriptBody(a).write((w) => w.insertText(ACTION, 0, "old "));
  const from = readStateVector(a.encodeStateVector()).get(1) ?? 0;
  scriptBody(a).write((w) => w.insertText(ACTION, 4, "new "));
  scriptBody(a).write((w) => w.setBlockAttrs(ACTION, { omitted: true }));
  expect(readBlockExcluding(a, ACTION, new Map([[1, from]]))).toEqual({
    type: "block",
    attrs: { id: ACTION, type: "action", ...UNSET, omitted: true },
    content: [
      { type: "text", text: "old Waves climb the " },
      { type: "text", text: "glass", marks: [{ type: "italic" }] },
      { type: "text", text: "." },
    ],
  });
});

test("a block that is gone has no authors and no reading", () => {
  const since = doc.encodeStateVector();
  expect([
    blockAuthors(doc, "missing", since),
    readBlockExcluding(doc, "missing", new Map()),
  ]).toEqual([[], null]);
});

test("reading a block does not walk text it was not asked for", () => {
  const large = scriptDocFromJSON(
    sectionize(
      Array.from({ length: 20_000 }, (_, i) => block(idOf(i), `line ${i}`)),
    ),
  );
  const toDelta = spyOn(Y.XmlText.prototype, "toDelta");
  try {
    const read = readBlocks(large, new Set([idOf(12_345)]));
    expect([[...read.keys()], toDelta.mock.calls.length]).toEqual([
      [idOf(12_345)],
      1,
    ]);
  } finally {
    toDelta.mockRestore();
  }
});
