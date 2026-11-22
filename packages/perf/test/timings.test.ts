import { expect, test } from "bun:test";
import { summarise, timingsOf } from "../src/index.ts";

test("timings are the same statistics as the benchmark's", () => {
  const marks = [10, 20, 30, 40, 50].map((d, i) => ({
    name: "editor.keystroke",
    startMs: i,
    durationMs: d,
  }));
  expect(timingsOf(marks, null).keystroke).toEqual(
    summarise([10, 20, 30, 40, 50]),
  );
  expect(timingsOf([], { liveBytes: 300, plainBytes: 100 })).toEqual({
    keystroke: null,
    pagination: null,
    roundTrip: null,
    size: { liveBytes: 300, ratio: 3 },
  });
});

test("each timing reads only its own mark", () => {
  const marks = [
    { name: "editor.keystroke", startMs: 0, durationMs: 4 },
    { name: "pagination.engine", startMs: 1, durationMs: 2 },
    { name: "sync.ack", startMs: 2, durationMs: 30 },
    { name: "editor.dispatch", startMs: 3, durationMs: 9 },
  ];
  expect(timingsOf(marks, null)).toEqual({
    keystroke: summarise([4]),
    pagination: summarise([2]),
    roundTrip: summarise([30]),
    size: null,
  });
});
