import { expect, test } from "bun:test";
import { blockText, blocksOf, sectionize } from "@manent/schema";
import type { BlockJSON, DocJSON, FlatBlock } from "@manent/schema";
import {
  ROOT_TYPE_NAMES,
  measureDoc,
  readStateVector,
  rebuildDoc,
  scriptBody,
  scriptDocFromJSON,
  scriptSettings,
} from "../src/index.ts";
import type { CrdtDoc } from "../src/index.ts";
import {
  ID_A,
  SAMPLE,
  agedScript,
  block,
  blockAt,
  bodyBlockIds,
  capture,
  idOf,
  sectionOf,
  sectionSizes,
  stripSection,
  unevenScript,
  withForeignElement,
  withRoot,
} from "./helpers.ts";

function rebuildOf(source: CrdtDoc): CrdtDoc {
  const result = rebuildDoc(source, { clientId: 1 });
  if (!result.ok) throw new Error(result.code);
  return result.doc;
}

test("a rebuilt document holds the same blocks and settings, in even sections", () => {
  const source = unevenScript([5, 100, 100, 45]); // 250 blocks in four sections, typed into by three client ids
  scriptSettings(source).set("paper", "a4", {
    userId: "sam",
    setAt: 5,
    replaced: null,
  });
  const rebuilt = rebuildDoc(source, { clientId: 1 });
  if (!rebuilt.ok) throw new Error(rebuilt.code);
  expect(
    blocksOf(scriptBody(rebuilt.doc).materialize()).map(stripSection),
  ).toEqual(blocksOf(scriptBody(source).materialize()).map(stripSection));
  expect(sectionSizes(rebuilt.doc)).toEqual([84, 83, 83]);
  expect([
    scriptSettings(rebuilt.doc).entries(),
    scriptSettings(rebuilt.doc).meta("paper"),
  ]).toEqual([{ paper: "a4" }, { userId: "sam", setAt: 5, replaced: null }]);
});

test("a rebuilt document sheds every old client id and the tombstones they left", () => {
  const source = agedScript({
    blocks: 300,
    sessions: 60,
    editsPerSession: 20,
    seed: 4,
  }); // a fresh client id per session; types, deletes, moves
  const before = measureDoc(source);
  const rebuilt = rebuildDoc(source, { clientId: 1 });
  if (!rebuilt.ok) throw new Error(rebuilt.code);
  const after = measureDoc(rebuilt.doc);
  expect([before.clientIds, after.clientIds, after.plainBytes]).toEqual([
    61,
    1,
    before.plainBytes,
  ]);
  expect(after.liveBytes).toBeLessThan(before.liveBytes / 1.25);
  expect(readStateVector(rebuilt.doc.encodeStateVector())).toEqual(
    new Map([[1, expect.any(Number)]]),
  );
});

test("the same document rebuilds to the same bytes", () => {
  const source = unevenScript([5, 100, 100, 45]);
  scriptSettings(source).set("paper", "a4", {
    userId: "sam",
    setAt: 5,
    replaced: null,
  });
  scriptSettings(source).set("font", "mono", {
    userId: "lou",
    setAt: 9,
    replaced: null,
  });
  expect(rebuildOf(source).encodeState()).toEqual(
    rebuildOf(source).encodeState(),
  );
});

test("what a newer build wrote survives a rebuild", () => {
  const newer: BlockJSON = {
    type: "block",
    attrs: { id: ID_A, type: "action", glow: 3 },
    content: [
      { type: "text", text: "Wait. " },
      {
        type: "text",
        text: "Now.",
        marks: [{ type: "blink", attrs: { rate: 2 } }],
      },
    ],
  };
  const source = scriptDocFromJSON(sectionize([newer]), { clientId: 4 });
  expect(scriptBody(rebuildOf(source)).materialize()).toEqual({
    type: "doc",
    content: [
      {
        type: "section",
        content: [
          {
            type: "block",
            attrs: {
              id: ID_A,
              type: "action",
              omitted: false,
              synopsis: "",
              noContd: false,
              noTiming: false,
              glow: 3,
            },
            content: [
              { type: "text", text: "Wait. " },
              {
                type: "text",
                text: "Now.",
                marks: [{ type: "blink", attrs: { rate: 2 } }],
              },
            ],
          },
        ],
      },
    ],
  });
});

test("a rebuild copies the script body, the two settings maps, the overrides map, the notes, the import record, the title page, the alternates, the cuts and the scene progress, and no other root", () => {
  expect(ROOT_TYPE_NAMES).toEqual([
    "prosemirror",
    "settings",
    "settingsMeta",
    "revisedOverrides",
    "notes",
    "imported",
    "titlePage",
    "alternates",
    "cuts",
    "sceneProgress",
  ]);
});

test("a document that cannot be copied faithfully is left alone", () => {
  expect(rebuildDoc(withRoot(SAMPLE, "elsewhere"), { clientId: 1 })).toEqual({
    ok: false,
    code: "unknown_root",
  });
  expect(
    rebuildDoc(
      scriptDocFromJSON(sectionize([block(ID_A, "one"), block(ID_A, "two")])),
      { clientId: 1 },
    ),
  ).toEqual({ ok: false, code: "duplicate_ids" });
  expect(
    rebuildDoc(withForeignElement(SAMPLE, "page"), { clientId: 1 }),
  ).toEqual({ ok: false, code: "invalid" });
});

/** What a page lock reads of each block: its ID, number, whether it is omitted, its place, and its runs. */
function lockedFields(flat: FlatBlock): unknown[] {
  return [
    flat.attrs.id,
    flat.attrs.num,
    flat.attrs.omitted,
    flat.index,
    blockText(flat),
    flat.runs,
  ];
}

/** Scenes in sections of uneven size: numbered headings, one omitted, and marked text. */
function lockedScript(): DocJSON {
  const blocks = Array.from({ length: 30 }, (_, i): BlockJSON => {
    if (i % 5 !== 0) return block(idOf(i), `beat ${i}`);
    return {
      type: "block",
      attrs: {
        id: idOf(i),
        type: "scene_heading",
        num: `${i / 5 + 1}`,
        omitted: i === 10,
      },
      content: [
        { type: "text", text: "INT. " },
        { type: "text", text: `ROOM ${i}`, marks: [{ type: "bold" }] },
      ],
    };
  });
  return {
    type: "doc",
    content: [
      { type: "section", content: blocks.slice(0, 2) },
      { type: "section", content: blocks.slice(2, 27) },
      { type: "section", content: blocks.slice(27) },
    ],
  };
}

test("what page locks rely on is unchanged by a rebuild", () => {
  const source = scriptDocFromJSON(lockedScript(), { clientId: 4 });
  capture(source, (w) => w.insertText(idOf(3), 4, "again "));
  expect(
    blocksOf(scriptBody(rebuildOf(source)).materialize()).map(lockedFields),
  ).toEqual(blocksOf(scriptBody(source).materialize()).map(lockedFields));
});

test("a dual-dialogue run is never split between two sections", () => {
  const source = unevenScript([250], { dualAt: 82 }); // blocks 82–87: a left speech of three blocks, then its right partner of three
  const rebuilt = rebuildDoc(source, { clientId: 1 });
  if (!rebuilt.ok) throw new Error(rebuilt.code);
  expect(sectionSizes(rebuilt.doc)).toEqual([88, 79, 83]); // sectionize's boundary at 84 moves to 88; the next stays at 167
  expect(sectionOf(rebuilt.doc, blockAt(source, 82))).toBe(
    sectionOf(rebuilt.doc, blockAt(source, 87)),
  );
});

test("a left speech longer than a section stays whole, and leaves no empty section", () => {
  const blocks = Array.from({ length: 250 }, (_, i): BlockJSON => {
    if (i < 80 || i > 180) return block(idOf(i), `line ${i}`);
    return {
      type: "block",
      attrs: { id: idOf(i), type: "dialogue", dual: "left" },
      content: [{ type: "text", text: `line ${i}` }],
    };
  }); // blocks 80–180: one left speech of 101 blocks
  const source = scriptDocFromJSON(sectionize(blocks), { clientId: 4 });
  const rebuilt = rebuildOf(source);
  expect([sectionSizes(rebuilt), bodyBlockIds(rebuilt)]).toEqual([
    [181, 69],
    blocks.map((_, i) => idOf(i)),
  ]); // sectionize's boundaries at 84 and 167 both move to 181
});
