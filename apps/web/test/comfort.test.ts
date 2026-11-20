import { expect, test } from "bun:test";
import {
  COMFORT_LIMIT_PAGES,
  pastComfortLimit,
} from "../src/editor-host/comfort.ts";

test("the notice starts one page past the limit", () => {
  expect([
    pastComfortLimit(COMFORT_LIMIT_PAGES),
    pastComfortLimit(COMFORT_LIMIT_PAGES + 1),
    pastComfortLimit(null),
  ]).toEqual([false, true, false]);
});

test("the comfort limit is the measured figure", () => {
  expect(COMFORT_LIMIT_PAGES).toBe(120);
});
