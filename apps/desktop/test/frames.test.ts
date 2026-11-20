import { expect, test } from "bun:test";
import { DEFAULT_FRAME, frameToRestore } from "../src/frames.ts";

test("a saved frame is used only if the system leaves it where it was put", () => {
  const f = { x: 100, y: 80, width: 1280, height: 800 };
  expect(frameToRestore(f, (x) => x)).toEqual(f);
  expect(frameToRestore(f, () => ({ ...f, x: 0 }))).toBeNull();
  expect(frameToRestore(null, (x) => x)).toBeNull();
});

test("a window with nothing to restore opens at 1280 by 800", () => {
  expect(DEFAULT_FRAME).toEqual({ x: 0, y: 0, width: 1280, height: 800 });
});
