import { expect, test } from "bun:test";
import {
  corpusDoc,
  corpusId,
  filledText,
  generateBlocks,
} from "@manent/pagination/testing";
import { parseDoc } from "@manent/schema";
import {
  deleteRangeKeepingSections,
  domLineCount,
  driftKey,
  forceLines,
  paginationKey,
} from "../src/index.ts";
import { keysOf, stateWithDrift } from "./docs.ts";

test("a block's rendered lines are counted from its height", () => {
  expect([
    domLineCount(48, 0, 1),
    domLineCount(64, 0, 1),
    domLineCount(64, 0, 2),
    domLineCount(298, 250, 1),
  ]).toEqual([3, 4, 2, 3]);
});

test("a block held to the model breaks at each of the model's line starts, and pagination is untouched", () => {
  const s = stateWithDrift(
    parseDoc(
      corpusDoc([
        { type: "action", text: filledText(60, 3), kind: null, dual: null },
      ]),
    ),
  );
  const next = s.apply(forceLines(s.tr, [corpusId(0)]));
  expect(paginationKey.getState(next) === paginationKey.getState(s)).toBe(true);
  expect([
    keysOf(driftKey.getState(next)!.decorations),
    [...driftKey.getState(next)!.forced],
  ]).toEqual([
    ["122:122:lb:120", "1:183:lb-forced", "62:62:lb:60"],
    [corpusId(0)],
  ]);
});

test("the set is bounded and forgets blocks that are gone", () => {
  const s = stateWithDrift(
    parseDoc(corpusDoc(generateBlocks("screenplay", 700, 1))),
  );
  const forced = s.apply(
    forceLines(
      s.tr,
      Array.from({ length: 600 }, (_, i) => corpusId(i)),
    ),
  );
  expect(driftKey.getState(forced)!.forced.size).toBe(500);
  const cut = forced.apply(
    deleteRangeKeepingSections(forced.tr, 0, forced.doc.content.size),
  );
  expect([...driftKey.getState(cut)!.forced]).toEqual([corpusId(0)]);
});
