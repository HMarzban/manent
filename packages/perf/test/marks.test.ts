import { expect, test } from "bun:test";
import {
  MARK_BUFFER_SIZE,
  clearMarks,
  mark,
  markEnd,
  markStart,
  marksEnabled,
  readMarks,
  setMarksEnabled,
} from "../src/index.ts";

// Must stay first: it observes the module's initial state.
test("marks are off by default and cost nothing", () => {
  expect(marksEnabled()).toBe(false);
  expect(mark("a.b", () => 42)).toBe(42);
  expect(markStart("a.b")).toBe(-1);
  markEnd("a.b", -1);
  expect(readMarks()).toEqual([]);
});

test("an enabled mark records one duration", () => {
  clearMarks();
  setMarksEnabled(false);
  setMarksEnabled(true);
  expect(marksEnabled()).toBe(true);
  expect(mark("pagination.engine", () => "pages")).toBe("pages");
  const t = markStart("binding.apply");
  expect(t).toBeGreaterThanOrEqual(0);
  markEnd("binding.apply", t);
  expect(readMarks().map((r) => r.name)).toEqual([
    "pagination.engine",
    "binding.apply",
  ]);
  expect(readMarks("binding.apply")).toHaveLength(1);
  expect(readMarks("binding.apply")[0]?.start).toBe(t);
  for (const r of readMarks()) expect(r.duration).toBeGreaterThanOrEqual(0);
});

test("a mark records even when the work throws, and rethrows", () => {
  clearMarks();
  setMarksEnabled(false);
  setMarksEnabled(true);
  const failure = new Error("work stopped");
  expect(() =>
    mark("sync.flush", () => {
      throw failure;
    }),
  ).toThrow(failure);
  expect(readMarks().map((r) => r.name)).toEqual(["sync.flush"]);
});

test("a disabled mark runs the work and records nothing", () => {
  clearMarks();
  setMarksEnabled(false);
  let runs = 0;
  mark("a.b", () => runs++);
  const t = markStart("a.b");
  markEnd("a.b", t);
  expect(runs).toBe(1);
  expect(readMarks()).toEqual([]);
});

test("clearing forgets every record", () => {
  clearMarks();
  setMarksEnabled(false);
  setMarksEnabled(true);
  mark("a.b", () => 0);
  clearMarks();
  expect(readMarks()).toEqual([]);
  mark("c.d", () => 0);
  expect(readMarks().map((r) => r.name)).toEqual(["c.d"]);
});

test("the buffer is bounded, so a soak stays flat", () => {
  clearMarks();
  setMarksEnabled(false);
  setMarksEnabled(true);
  mark("first.mark", () => 0);
  for (let i = 0; i < MARK_BUFFER_SIZE + 4; i++) mark("x.y", () => 0);
  const records = readMarks();
  expect(records).toHaveLength(MARK_BUFFER_SIZE);
  expect(readMarks("first.mark")).toEqual([]);
  for (let i = 1; i < records.length; i++) {
    expect(records[i]!.start).toBeGreaterThanOrEqual(records[i - 1]!.start);
  }
});
