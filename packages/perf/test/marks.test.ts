import { expect, test } from "bun:test";
import {
  clearMarks,
  createMarks,
  mark,
  readMarks,
  setMarksEnabled,
} from "../src/index.ts";

// Every test makes its own marks; none depends on another or on its place in the file.
const fresh = (size = 8) => {
  let t = 0;
  return createMarks({ size, now: () => (t += 5) });
};

test("marks are off until switched on, and cost nothing while off", () => {
  const m = fresh();
  expect([m.enabled(), m.mark("a.b", () => 42), m.start()]).toEqual([
    false,
    42,
    -1,
  ]);
  m.end("a.b", -1);
  expect(m.read()).toEqual([]);
});

test("an enabled mark records its start and its duration in milliseconds", () => {
  const m = fresh();
  m.setEnabled(true);
  expect(m.mark("pagination.engine", () => "pages")).toBe("pages");
  const token = m.start();
  m.end("binding.apply", token);
  expect(m.read()).toEqual([
    { name: "pagination.engine", startMs: 5, durationMs: 5 },
    { name: "binding.apply", startMs: 15, durationMs: 5 },
  ]);
  expect(m.read("binding.apply")).toHaveLength(1);
});

test("a mark records even when the work throws, and rethrows", () => {
  const m = fresh();
  m.setEnabled(true);
  const failure = new Error("work stopped");
  expect(() =>
    m.mark("sync.flush", () => {
      throw failure;
    }),
  ).toThrow(failure);
  expect(m.read().map((r) => r.name)).toEqual(["sync.flush"]);
});

test("a disabled mark runs the work and records nothing", () => {
  const m = fresh();
  m.setEnabled(true);
  m.setEnabled(false);
  let runs = 0;
  m.mark("a.b", () => runs++);
  const t = m.start();
  m.end("a.b", t);
  expect(runs).toBe(1);
  expect(m.read()).toEqual([]);
});

test("clearing forgets every record", () => {
  const m = fresh();
  m.setEnabled(true);
  m.mark("a.b", () => 0);
  m.clear();
  expect(m.read()).toEqual([]);
  m.mark("c.d", () => 0);
  expect(m.read().map((r) => r.name)).toEqual(["c.d"]);
});

test("the buffer keeps the newest records and never grows", () => {
  const m = fresh(8);
  m.setEnabled(true);
  for (let i = 0; i < 11; i++) m.mark(`n.${i}`, () => i);
  expect(m.read().map((r) => r.name)).toEqual([
    "n.3",
    "n.4",
    "n.5",
    "n.6",
    "n.7",
    "n.8",
    "n.9",
    "n.10",
  ]);
});

test("the product's marks are one instance behind the package's functions", () => {
  clearMarks();
  setMarksEnabled(true);
  mark("a.b", () => 1);
  expect(readMarks().map((r) => r.name)).toEqual(["a.b"]);
  setMarksEnabled(false);
  clearMarks();
});
