import { expect, test } from "bun:test";
import { profileFor } from "@manent/pagination";
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import { parseDoc } from "@manent/schema";
import {
  PAGE_GAP_PX,
  SPELLCHECK_MAX_BLOCKS,
  contentHeightPx,
  paginationKey,
  screenPagePx,
  sectionHeightPx,
  spellcheckFor,
} from "../src/index.ts";
import { state } from "./docs.ts";

test("the sections' heights add up to the pages", () => {
  for (const [format, paper] of [
    ["screenplay", "letter"],
    ["multicam", "letter"],
    ["manuscript", "a4"],
    ["stage_play", "a4"],
  ] as const) {
    const profile = profileFor(format, { paper })!;
    const st = paginationKey.getState(
      state(parseDoc(corpusDoc(generateBlocks(format, 1500, 1))), profile),
    )!;
    const sum = Array.from({ length: st.index.sectionPos.length }, (_, i) =>
      sectionHeightPx(st, i),
    ).reduce((a, b) => a + b, 0);
    const pages = st.pagination.pages.length;
    const whole = Math.round(
      (pages * screenPagePx(profile).height + (pages - 1) * PAGE_GAP_PX) * 1000,
    );
    expect([
      Math.round(sum * 1000),
      Math.round(contentHeightPx(st) * 1000),
    ]).toEqual([whole, whole]);
  }
});

test("spellcheck is switched off for very long scripts", () => {
  expect([
    spellcheckFor(SPELLCHECK_MAX_BLOCKS),
    spellcheckFor(SPELLCHECK_MAX_BLOCKS + 1),
  ]).toEqual(["true", "false"]);
});

test("a page's heights on screen lie on the quarter pixel", () => {
  expect([
    screenPagePx(profileFor("screenplay", { paper: "letter" })!),
    screenPagePx(profileFor("manuscript", { paper: "a4" })!),
  ]).toEqual([
    { width: 816, height: 1056, top: 96, bottom: 96 },
    { width: 793.7066666666666, height: 1122.5, top: 96, bottom: 98.5 },
  ]);
});
