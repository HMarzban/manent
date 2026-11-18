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
      "CHANGELOG.md",
      "AGENTS.md",
      "LICENSE",
      "docs/architecture/overview.md",
      "docs/benchmark/report.md",
      "docs/decisions/0001-a.md",
      "docs/memory/lessons.md",
      "spikes/01/RESULT.md",
      ".github/workflows/ci.yml",
      "notes/plan.md",
      "docs/anything/a.md",
      "docs/notes.md",
      "docs/architecture.md",
      "docs/decisions-old/a.md",
      "docs/benchmarks/a.md",
      "docs/memory",
      "secret.txt",
    ]),
  ).toEqual([
    "notes/plan.md",
    "docs/anything/a.md",
    "docs/notes.md",
    "docs/architecture.md",
    "docs/decisions-old/a.md",
    "docs/benchmarks/a.md",
    "docs/memory",
    "secret.txt",
  ]);
});

test("the check lists what is tracked and what must not be", async () => {
  const { tracked, untrackable } = await checkTracked(repoRoot);
  expect(tracked).toContain("package.json");
  expect(untrackable).toEqual([]);
});
