import { expect, test } from "bun:test";
import { ALL_GUIDES, checkBank, othersThan } from "./support/bank-rules.ts";

test("no phrase-bank line is in two banks, and every bank keeps its voice", () => {
  expect(
    ALL_GUIDES.flatMap((guide) =>
      checkBank(guide, othersThan(guide)).map((issue) => ({
        project: guide.project,
        ...issue,
      })),
    ),
  ).toEqual([]);
});
