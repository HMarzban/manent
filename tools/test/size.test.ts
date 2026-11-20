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

// A phrase bank is data, not logic: hundreds of hand-written entries in one file.
const BANKS = ["packages", "demo", "src", "generate", "banks"];

test("no source file is longer than 400 lines", async () => {
  const long: string[] = [];
  for (const pattern of SOURCES)
    for await (const file of new Bun.Glob(pattern).scan({ cwd: repoRoot })) {
      const parts = file.split(sep);
      if (
        parts.some(
          (part) =>
            part === "test" || part === "node_modules" || part === "dist",
        ) ||
        file.endsWith(".generated.ts") ||
        BANKS.every((part, i) => parts[i] === part)
      )
        continue;
      if (
        (await Bun.file(join(repoRoot, file)).text()).split("\n").length > 401
      )
        long.push(file);
    }
  expect(long).toEqual([]);
});
