import { afterEach, expect, spyOn, test } from "bun:test";
import { benchMode, benchThrottle, benchTier, proveMs } from "../env.ts";
import {
  inputBlocks,
  isQuiet,
  measurement,
  quietLoad,
  sampleMs,
} from "../measure.ts";

const BENCH_VARIABLES = [
  "MANENT_BENCH_TIER",
  "MANENT_BENCH_THROTTLE",
  "MANENT_BENCH_MODE",
  "MANENT_BENCH_PROVE_MS",
] as const;
const saved = BENCH_VARIABLES.map((name) => [name, process.env[name]] as const);

afterEach(() => {
  for (const [name, value] of saved)
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
});

/** performance.now() reading `readings` in turn. */
function fakeClock(readings: readonly number[]): void {
  let next = 0;
  spyOn(performance, "now").mockImplementation(() => readings[next++]!);
}

test("a sample is the work's time, and proof mode adds a wait inside it", async () => {
  delete process.env.MANENT_BENCH_PROVE_MS;
  fakeClock([10, 13]);
  expect(await sampleMs(() => {})).toBe(3);
  process.env.MANENT_BENCH_PROVE_MS = "100";
  fakeClock([10, 13, 60, 113]);
  expect(await sampleMs(async () => {})).toBe(103);
});

test("a synchronous sample is timed to its return, and its error is thrown", () => {
  delete process.env.MANENT_BENCH_PROVE_MS;
  expect(() =>
    sampleMs(() => {
      throw new RangeError("the work broke");
    }),
  ).toThrow("the work broke");
});

test("a measurement copies its samples and refuses an empty or non-finite list", () => {
  const samples = [1, 2];
  const m = measurement("t", "ms", samples);
  samples.push(3);
  expect(m).toEqual({ metric: "t", unit: "ms", samples: [1, 2] });
  expect(inputBlocks(2500)).toEqual({
    metric: "input_blocks",
    unit: "count",
    samples: [2500],
  });
  expect(() => measurement("t", "ms", [])).toThrow(RangeError);
  expect(() => measurement("t", "ms", [1, Number.NaN])).toThrow(RangeError);
  expect(() => measurement("t", "ms", [Infinity])).toThrow(RangeError);
});

test("a machine is quiet only at or under both its load and its spread", () => {
  expect([quietLoad(1), quietLoad(4), quietLoad(16)]).toEqual([1, 1, 4]);
  expect(
    [
      { load: 4, spread: 1.25 },
      { load: 4.1, spread: 1 },
      { load: 0, spread: 1.26 },
    ].map((q) => isQuiet(q, 16)),
  ).toEqual([true, false, false]);
});

test("the tier, mode, slowdown and proof wait come from the environment, and a misspelt value is refused", () => {
  for (const name of BENCH_VARIABLES) delete process.env[name];
  expect([benchTier(), benchMode(), benchThrottle(), proveMs()]).toEqual([
    "host",
    "standard",
    1,
    null,
  ]);
  process.env.MANENT_BENCH_TIER = "D-small";
  process.env.MANENT_BENCH_MODE = "quick";
  process.env.MANENT_BENCH_THROTTLE = "6";
  process.env.MANENT_BENCH_PROVE_MS = "800";
  expect([benchTier(), benchMode(), benchThrottle(), proveMs()]).toEqual([
    "D-small",
    "quick",
    6,
    800,
  ]);
  const refused: [string, string, () => unknown][] = [
    ["MANENT_BENCH_TIER", "d-small", benchTier],
    ["MANENT_BENCH_MODE", "fast", benchMode],
    ["MANENT_BENCH_THROTTLE", "2", benchThrottle],
    ["MANENT_BENCH_PROVE_MS", "0", proveMs],
    ["MANENT_BENCH_PROVE_MS", "1.5", proveMs],
  ];
  for (const [name, value, read] of refused) {
    process.env[name] = value;
    expect(read).toThrow(RangeError);
  }
});
