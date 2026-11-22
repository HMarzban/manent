import { expect, test } from "bun:test";
import { scrollDelta } from "../src/index.ts";

test("the caret's line keeps its place only when it changes page", () => {
  expect([
    scrollDelta({ page: 3, top: 700 }, { page: 3, top: 716 }),
    scrollDelta({ page: 3, top: 700 }, { page: 4, top: 932 }),
    scrollDelta(null, { page: 0, top: 10 }),
  ]).toEqual([0, 232, 0]);
});
