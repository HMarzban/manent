import { expect, test } from "bun:test";
import { profileFor } from "@manent/pagination";
import { corpusDoc } from "@manent/pagination/testing";
import { parseDoc } from "@manent/schema";
import fc from "fast-check";
import type { EditorState } from "prosemirror-state";
import { DecorationSet } from "prosemirror-view";
import {
  blockPos,
  decorationsFor,
  deleteRangeKeepingSections,
  paginationKey,
  setPagination,
  toBreakSpecs,
} from "../src/index.ts";
import {
  arbTransactions,
  blockDecorations,
  docOfBlocks,
  keysOf,
  play,
  replaceWholeDoc,
  ruleScript,
  script,
  state,
} from "./docs.ts";

const options = { style: "inline", offFontNote: "note" } as const;
const scenes = (s: EditorState) =>
  blockDecorations(s).map((a) => a?.["data-scene"] ?? null);

test("one widget per page break, inside sections, keyed by what it draws", () => {
  const s = state(parseDoc(corpusDoc(ruleScript("long-speech"))));
  const st = paginationKey.getState(s)!;
  const specs = toBreakSpecs(st.index, st.pagination, "inline");
  expect(
    specs.map((b) => [b.kind, b.label, b.more, b.head, b.contd, b.side]),
  ).toEqual([
    ["first", "1", null, null, null, -1],
    ["mid", "2", "(MORE)", "2.", "MARA (CONT'D)", -1],
    ["mid", "3", "(MORE)", "3.", "MARA (CONT'D)", -1],
    ["last", "3", null, null, null, 1],
  ]);
  expect([
    specs[1]!.key,
    specs.map((b) => s.doc.resolve(b.pos).depth >= 1),
  ]).toEqual(["pb:mid:2:0:1:0:0:MARA (CONT'D)", [true, true, true, true]]);
  expect(
    toBreakSpecs(st.index, st.pagination, "before_block").map((b) => b.kind),
  ).toEqual(["first", "page", "page", "last"]);
});

const widgets = (s: EditorState) =>
  keysOf(paginationKey.getState(s)!.decorations)
    .filter((k) => k.includes("pb:"))
    .map((k) => k.slice(k.indexOf("pb:")));

test("an edit that moves no break changes no widget", () => {
  const s = state(script());
  expect(widgets(s.apply(s.tr.insertText("x", 350)))).toEqual(widgets(s));
});

// The plugin's decorations, and those a fresh build of its pages gives.
function setAndFresh(s: EditorState): [string[], string[]] {
  const st = paginationKey.getState(s)!;
  const fresh = decorationsFor(
    st.index,
    st.pagination,
    0,
    st.index.blocks.length,
    options,
  );
  return [keysOf(st.decorations), keysOf(DecorationSet.create(s.doc, fresh))];
}

test("the set is what a fresh build would be, after anything", () => {
  const start = state(script());
  fc.assert(
    fc.property(arbTransactions, (apply) => {
      const [set, fresh] = setAndFresh(apply(start));
      expect(set).toEqual(fresh);
    }),
    { numRuns: 100 },
  );
});

test("an edit before a composition's pages catch up leaves the set a fresh build would be", () => {
  const s = state(script(400));
  const typing = s.apply(s.tr.insertText("kan", 300).setMeta("composition", 1));
  const ended = [
    typing.apply(typing.tr.insertText("a few more words", 200)),
    typing.apply(
      deleteRangeKeepingSections(typing.tr, 100, 20000).setMeta("remote", true),
    ),
    typing.apply(
      replaceWholeDoc(typing, 7, "rewritten by someone else").setMeta(
        "remote",
        true,
      ),
    ),
    typing.apply(setPagination(typing.tr, { repaginate: true })),
  ].map(setAndFresh);
  expect(ended.map(([set]) => set)).toEqual(ended.map(([, fresh]) => fresh));
});

test("text outside the script font is marked, in an element of its own", () => {
  const s = state(
    parseDoc(
      corpusDoc([
        { type: "action", text: "Tea 日本 now", kind: null, dual: null },
      ]),
    ),
  );
  // doc 0, section 1, block text from 2: units 4–6
  expect(
    keysOf(paginationKey.getState(s)!.decorations).filter((k) =>
      k.endsWith("mn-offfont"),
    ),
  ).toEqual(["6:8:mn-offfont"]);
});

test("blocks carry what the page styles need", () => {
  const playScript = ruleScript("stage-play");
  // the first stage direction
  expect(
    blockDecorations(state(parseDoc(corpusDoc(playScript)), play))[
      playScript.findIndex((b) => b.type === "action")
    ],
  ).toEqual({ "data-open": "(", "data-close": ")" });
  expect(
    blockDecorations(
      state(
        docOfBlocks([
          ["character", "JANE"],
          ["dialogue", "Yes."],
          ["action", "A beat."],
          ["character", "JANE"],
          ["dialogue", "No."],
        ]),
      ),
    ),
  ).toEqual([
    { class: "pg-first" },
    null,
    null,
    { "data-contd": " (CONT'D)" },
    null,
  ]);
});

test("scene numbers follow a scene added above them", () => {
  const multicam = profileFor("multicam")!;
  const doc = docOfBlocks([
    ["scene_heading", "INT. HALL - DAY"],
    ["action", "Rain."],
    ["action", "More rain."],
    ["scene_heading", "EXT. ROOF - NIGHT"],
  ]);
  const s = state(doc, multicam);
  const index = paginationKey.getState(s)!.index;
  const added = s.apply(
    s.tr.setNodeAttribute(blockPos(index, 2), "type", "scene_heading"),
  );
  expect([scenes(added), scenes(state(added.doc, multicam))]).toEqual([
    ["A", null, "B", "C"],
    ["A", null, "B", "C"],
  ]);
});
