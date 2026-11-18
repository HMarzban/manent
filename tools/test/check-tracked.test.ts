import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  checkTracked,
  untrackable as untrackableOf,
} from "../check-tracked.ts";

const repoRoot = join(import.meta.dir, "..", "..");

test("only the public tree may be tracked", () => {
  expect(
    untrackableOf([
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

test("the check lists what is tracked and what must not be", async () => {
  const { tracked, untrackable } = await checkTracked(repoRoot);
  expect(tracked).toContain("package.json");
  expect(untrackable).toEqual([]);
});
