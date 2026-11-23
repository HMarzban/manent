import { expect, test } from "bun:test";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");
type Step = { uses?: string; run?: string; with?: Record<string, unknown> };
const ci = Bun.YAML.parse(
  await Bun.file(join(repoRoot, ".github/workflows/ci.yml")).text(),
) as {
  permissions: unknown;
  jobs: Record<
    string,
    {
      strategy: { "fail-fast": boolean; matrix: { os: string[] } };
      steps: Step[];
    }
  >;
};

test("the gate runs on macOS, Windows and Linux", () => {
  expect(ci.jobs.verify!.strategy.matrix.os).toEqual([
    "ubuntu-24.04",
    "macos-26",
    "windows-2025",
  ]);
  expect(ci.jobs.verify!.strategy["fail-fast"]).toBe(false);
});

test("Bun is pinned to 1.4.4, the lockfile is frozen, and the whole gate runs", () => {
  const steps = ci.jobs.verify!.steps;
  expect(steps[0]!.uses).toBe("actions/checkout@v5");
  expect(steps[0]!.with).toEqual({ "persist-credentials": false });
  expect(steps[1]!.uses).toBe("oven-sh/setup-bun@v2");
  expect(steps[1]!.with).toEqual({ "bun-version": "1.4.4" });
  expect(steps.map((s) => s.run).filter(Boolean)).toEqual([
    "bun install --frozen-lockfile",
    "bun run --filter @manent/e2e install-browsers",
    "bun run verify",
    "bun run test:e2e",
    "bun run test:clone",
  ]);
});

test("the job can only read the repository", () => {
  expect(ci.permissions).toEqual({ contents: "read" });
});

test("a second job runs the demo from a clean checkout and walks the Tour on three systems", () => {
  expect(Object.keys(ci.jobs)).toEqual(["verify", "demo"]);
  expect(ci.jobs.demo!.strategy.matrix.os).toEqual([
    "ubuntu-24.04",
    "macos-26",
    "windows-2025",
  ]);
  expect(ci.jobs.demo!.strategy["fail-fast"]).toBe(false);
  const steps = ci.jobs.demo!.steps;
  expect(steps[0]!.uses).toBe("actions/checkout@v5");
  expect(steps[0]!.with).toEqual({ "persist-credentials": false });
  expect(steps[1]!.uses).toBe("oven-sh/setup-bun@v2");
  expect(steps[1]!.with).toEqual({ "bun-version": "1.4.4" });
  expect(steps.map((s) => s.run).filter(Boolean)).toEqual([
    "bun install --frozen-lockfile",
    "bun run --filter @manent/e2e install-browsers",
    "bun run seed:check",
    "bun run test:demo",
  ]);
});
