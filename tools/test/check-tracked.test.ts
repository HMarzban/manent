import { expect, test } from "bun:test";
import { join } from "node:path";
import { checkTracked, untrackable } from "../check-tracked.ts";

const repoRoot = join(import.meta.dir, "..", "..");

test("only the public tree may be tracked", () => {
  expect(
    untrackable([
      "packages/a/src/x.ts",
      "README.md",
      "spikes/01/RESULT.md",
      ".github/workflows/ci.yml",
      "notes/plan.md",
      "docs/anything/a.md",
      "secret.txt",
    ]),
  ).toEqual(["notes/plan.md", "docs/anything/a.md", "secret.txt"]);
});

test("this repository tracks nothing outside it", async () => {
  expect(await checkTracked(repoRoot)).toEqual([]);
});
