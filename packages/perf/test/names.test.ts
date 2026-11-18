import { expect, test } from "bun:test";
import { join } from "node:path";
import { PERF_MARKS } from "../src/index.ts";

test("the mark names are a fixed list", () => {
  expect(PERF_MARKS).toEqual(["pagination.decorations", "pagination.engine"]);
});

// later marks may be appended after these
test("the typesetting marks are listed", () => {
  expect(PERF_MARKS).toEqual(
    expect.arrayContaining(["pagination.decorations", "pagination.engine"]),
  );
});

test("every mark recorded in product code is on the list, and is lower-case words joined by dots", async () => {
  const call = new RegExp('\\bmark(?:End)?\\(\\s*"([^"]+)"', "g");
  const root = join(import.meta.dir, "..", "..", "..");
  const used = new Set<string>();
  for await (const file of new Bun.Glob(
    "{packages,apps}/*/src/**/*.{ts,tsx}",
  ).scan({ cwd: root }))
    for (const m of (await Bun.file(join(root, file)).text()).matchAll(call))
      used.add(m[1]!);
  expect([...used].filter((name) => !PERF_MARKS.includes(name))).toEqual([]);
  for (const name of PERF_MARKS)
    expect(name).toMatch(new RegExp("^[a-z]+(\\.[a-z_]+)+$"));
});
