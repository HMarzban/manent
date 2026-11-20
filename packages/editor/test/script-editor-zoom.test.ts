import { expect, test } from "bun:test";
import { fitWidthPercent } from "../src/index.ts";

test("fit width fills the desk, within the zoom's range", () => {
  expect([
    fitWidthPercent(1000, 816, 64),
    fitWidthPercent(300, 816, 64),
    fitWidthPercent(4000, 816, 64),
  ]).toEqual([113, 50, 300]);
});
