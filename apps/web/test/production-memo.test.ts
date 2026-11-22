import { expect, test } from "bun:test";
import { memoText, recallMemo } from "@manent/revisions";
import { memoOf } from "../src/production/send/memo-row.tsx";

const TODAY = "2026-11-22";

const issueMemo = (pages: readonly string[]): string =>
  memoText("Blue", TODAY, pages);

const recallMemoOf = (pages: readonly string[]): string =>
  recallMemo("Blue", TODAY, pages, "2026-11-21");

test("Issue writes no memo while no page is revised, and its memo once one is", () => {
  expect([
    memoOf(null, [], issueMemo),
    memoOf(null, ["3", "17A"], issueMemo),
    memoOf("Pink pages for the table read", [], issueMemo),
  ]).toEqual([
    null,
    "Blue revisions 22 Nov: pp. 3, 17A",
    "Pink pages for the table read",
  ]);
});

test("Recall writes no memo while no page is ticked, and its memo once one is", () => {
  expect([
    memoOf(null, [], recallMemoOf),
    memoOf(null, ["9"], recallMemoOf),
  ]).toEqual([
    null,
    "Blue (corrected), 22 Nov. Replaces p. 9 of Blue as issued on 21 Nov. Corrected: ",
  ]);
});
