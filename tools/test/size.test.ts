import { expect, test } from "bun:test";
import { join, sep } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

// Bun.Glob matches nothing for a brace group holding a slash, so each root has its own pattern.
const SOURCES = [
  "packages/*/src/**/*.{ts,tsx}",
  "apps/*/**/*.{ts,tsx}",
  "bench/**/*.{ts,tsx}",
  "tools/**/*.{ts,tsx}",
];

test("no source file is longer than 400 lines", async () => {
  const long: string[] = [];
  for (const pattern of SOURCES)
    for await (const file of new Bun.Glob(pattern).scan({ cwd: repoRoot })) {
      if (
        file
          .split(sep)
          .some(
            (part) =>
              part === "test" || part === "node_modules" || part === "dist",
          ) ||
        file.endsWith(".generated.ts")
      )
        continue;
      if (
        (await Bun.file(join(repoRoot, file)).text()).split("\n").length > 401
      )
        long.push(file);
    }
  expect(long).toEqual([]);
});
