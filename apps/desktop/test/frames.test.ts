import { expect, test } from "bun:test";
import { DEFAULT_FRAME, frameToRestore, initialFrame } from "../src/frames.ts";

test("a saved frame is used only if the system leaves it where it was put", () => {
  const f = { x: 100, y: 80, width: 1440, height: 940 };
  expect(frameToRestore(f, (x) => x)).toEqual(f);
  expect(frameToRestore(f, () => ({ ...f, x: 0 }))).toBeNull();
  expect(frameToRestore(null, (x) => x)).toBeNull();
});

test("a window with nothing to restore opens at 1440 by 940 when display space allows", () => {
  expect(DEFAULT_FRAME).toEqual({ x: 0, y: 0, width: 1440, height: 940 });
  expect(initialFrame(null)).toEqual({ width: 1440, height: 940 });
  expect(initialFrame({ width: 1920, height: 1040 })).toEqual({
    width: 1440,
    height: 940,
  });
});

test("initialFrame clamps comfortably to compact laptop displays without overflowing", () => {
  expect(initialFrame({ width: 1512, height: 945 })).toEqual({
    width: 1440,
    height: 897,
  });
  expect(initialFrame({ width: 1440, height: 830 })).toEqual({
    width: 1392,
    height: 782,
  });
  expect(initialFrame({ width: 1366, height: 720 })).toEqual({
    width: 1318,
    height: 672,
  });
  expect(initialFrame({ width: 800, height: 560 })).toEqual({
    width: 800,
    height: 560,
  });
});
