import { expect, test } from "bun:test";
import {
  BLOCK_TYPES,
  canonicalDoc,
  parseDoc,
  validateDoc,
} from "@manent/schema";
import type { RawElement } from "@manent/schema";
import * as Y from "yjs";
import {
  scriptBody,
  scriptDocFromJSON,
  yXmlFragmentForBinding,
} from "../src/index.ts";
import { ALL_MARKS, ID, SAMPLE, docWith, idFor, runs } from "./helpers.ts";

function element(parent: Y.XmlFragment, index: number): Y.XmlElement {
  const child = parent.get(index);
  if (!(child instanceof Y.XmlElement))
    throw new RangeError(`child ${index} is not an element`);
  return child;
}

function text(parent: Y.XmlFragment, index: number): Y.XmlText {
  const child = parent.get(index);
  if (!(child instanceof Y.XmlText))
    throw new RangeError(`child ${index} is not text`);
  return child;
}

/** The key under which a suggestion with these attributes is stored. */
function keyOf(attrs: Record<string, unknown>): string | undefined {
  const doc = scriptDocFromJSON(
    docWith({ id: "k".repeat(16), type: "action" }, [
      { text: "x", marks: [{ type: "suggest_insert", attrs }] },
    ]),
  );
  const yBlock = element(element(yXmlFragmentForBinding(doc), 0), 0);
  return Object.keys(text(yBlock, 0).toDelta()[0].attributes)[0];
}

test("every element and mark survives the round trip", () => {
  for (const type of BLOCK_TYPES) {
    const json = docWith({ id: idFor(type), type }, ALL_MARKS);
    expect(
      parseDoc(scriptBody(scriptDocFromJSON(json)).materialize()).eq(
        parseDoc(json),
      ),
    ).toBe(true);
  }
});

test("materialize gives the canonical form", () => {
  for (const json of [
    SAMPLE,
    docWith({ id: "c".repeat(16), type: "action", glow: 3 }, ALL_MARKS),
  ])
    expect(
      JSON.stringify(scriptBody(scriptDocFromJSON(json)).materialize()),
    ).toBe(JSON.stringify(canonicalDoc(json)));
});

test("text outside Latin is kept exactly", () => {
  const value = "🎬 Ünïcödé — مرحبا بالعالم — é — 日本語";
  const body = scriptBody(
    scriptDocFromJSON(docWith({ id: "u".repeat(16), type: "dialogue" }, value)),
  );
  expect(body.materialize().content![0]!.content![0]!.content![0]!.text).toBe(
    value,
  );
});

test("an unknown attribute and mark survive materialize → scriptDocFromJSON", () => {
  const json = docWith({ id: "v".repeat(16), type: "action", glow: 3 }, [
    { text: "Rain", marks: [{ type: "blink", attrs: { rate: 2 } }] },
  ]);
  const once = scriptBody(scriptDocFromJSON(json)).materialize();
  const twice = scriptBody(scriptDocFromJSON(once)).materialize();
  expect(twice).toEqual(once);
  expect(once.content![0]!.content![0]!.attrs).toMatchObject({ glow: 3 });
  expect(once.content![0]!.content![0]!.content![0]!.marks).toEqual([
    { type: "blink", attrs: { rate: 2 } },
  ]);
});

test("storage matches the y-prosemirror 1.3.7 binding", () => {
  const doc = scriptDocFromJSON(
    docWith({ id: "b1b1b1b1b1b1b1b1", type: "dialogue" }, [
      { text: "Hello ", marks: [{ type: "bold" }] },
      {
        text: "world",
        marks: [
          {
            type: "suggest_insert",
            attrs: { id: "s1", authorUserId: "dana", at: 5 },
          },
        ],
      },
    ]),
  );
  const yBlock = element(element(yXmlFragmentForBinding(doc), 0), 0);
  const stored: Record<string, unknown> = yBlock.getAttributes();
  expect(stored).toEqual({
    id: "b1b1b1b1b1b1b1b1",
    type: "dialogue",
    omitted: false,
    synopsis: "",
    noContd: false,
    noTiming: false,
  });
  expect(text(yBlock, 0).toDelta()).toEqual([
    { insert: "Hello ", attributes: { bold: {} } },
    {
      insert: "world",
      attributes: {
        "suggest_insert--vfeNmJSG": { id: "s1", authorUserId: "dana", at: 5 },
      },
    },
  ]);
  const [section] = scriptBody(doc).materializeRaw().content as RawElement[];
  const [raw] = section!.content as RawElement[];
  // the raw shape: the storage suffix is gone, nothing optional
  expect(raw!.content).toEqual([
    { type: "text", text: "Hello ", marks: [{ type: "bold", attrs: {} }] },
    {
      type: "text",
      text: "world",
      marks: [
        {
          type: "suggest_insert",
          attrs: { id: "s1", authorUserId: "dana", at: 5 },
        },
      ],
    },
  ]);
  expect(validateDoc(scriptBody(doc).materializeRaw())).toEqual([]);
}); // "vfeNmJSG" is the key this algorithm gives the canonical mark with lib0 0.2.120, and the key y-prosemirror 1.3.7 itself writes for that mark

test("the storage key of a suggestion does not depend on how the mark was written down", () => {
  const full = keyOf({ id: "s1", authorUserId: "dana", at: 0 });
  expect(keyOf({ id: "s1", authorUserId: "dana" })).toBe(full); // a defaulted attribute left out
  expect(keyOf({ at: 0, authorUserId: "dana", id: "s1" })).toBe(full); // another key order
  expect(keyOf({ id: "s1", authorUserId: "dana", at: 5 })).toBe(
    "suggest_insert--vfeNmJSG",
  ); // the key of the test above
  expect(keyOf({ id: "s2", authorUserId: "dana", at: 0 })).not.toBe(full);
});

test("what a newer build wrote survives this build's edits to the same block", () => {
  const doc = scriptDocFromJSON(
    docWith({ id: ID, type: "action", glow: 3 }, [
      { text: "Rain on ", marks: [{ type: "blink", attrs: { rate: 2 } }] },
      { text: "the window" },
    ]),
  );
  const body = scriptBody(doc);
  body.write((w) => {
    w.setBlockAttrs(ID, { type: "character", dual: "left" });
    w.insertText(ID, 4, "!");
    w.deleteText(ID, 0, 1);
    w.addMark(ID, 8, 3, { type: "bold" });
  });
  const block = body.materialize().content![0]!.content![0]!;
  expect(block.attrs).toMatchObject({
    glow: 3,
    type: "character",
    dual: "left",
  }); // the unknown attribute is still there
  expect(runs(doc, ID)[0]).toEqual(["ain", ["blink"]]); // and the unknown mark, on the text it was on
  expect(block.content![0]!.marks).toEqual([
    { type: "blink", attrs: { rate: 2 } },
  ]);
});

test("what a foreign writer left is visible to validation, and absent from the script", () => {
  const doc = scriptDocFromJSON(SAMPLE);
  const frag = yXmlFragmentForBinding(doc); // a foreign client writes structure of its own
  frag.insert(0, [new Y.XmlElement("page")]);
  element(element(frag, 1), 0).insert(0, [new Y.XmlElement("section")]); // a node this build knows, where text belongs
  const codes = validateDoc(scriptBody(doc).materializeRaw()).map(
    (issue) => issue.code,
  );
  expect(codes).toContain("unknown_node");
  expect(codes).toContain("non_text_content");
  expect(() => parseDoc(scriptBody(doc).materialize())).not.toThrow();
});
