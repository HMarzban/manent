import { expect, test } from "bun:test";
import { focusHeading } from "../src/focus.ts";

test("the heading takes focus, and its absence is not a failure", () => {
  let focused = 0;
  expect(
    focusHeading({
      querySelector: (selector) =>
        selector === "h1"
          ? {
              focus: () => {
                focused++;
              },
            }
          : null,
    }),
  ).toBe(true);
  expect(focused).toBe(1);
  expect(focusHeading({ querySelector: () => null })).toBe(false);
});
