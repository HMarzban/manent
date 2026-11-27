import { expect, test } from "bun:test";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");
type Step = {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
};
interface Job {
  "runs-on": string;
  strategy?: {
    "fail-fast": boolean;
    matrix: { os: string[]; browser?: string[] };
  };
  steps: Step[];
}
const ci = Bun.YAML.parse(
  await Bun.file(join(repoRoot, ".github/workflows/ci.yml")).text(),
) as {
  permissions: unknown;
  concurrency: { group: string; "cancel-in-progress": string };
  jobs: Record<string, Job>;
};

const ALL_OS = ["ubuntu-24.04", "macos-26", "windows-2025"];

function expectSetupSteps(steps: Step[]): void {
  expect(steps[0]!.uses).toBe("actions/checkout@v5");
  expect(steps[0]!.with).toEqual({ "persist-credentials": false });
  expect(steps[1]!.uses).toBe("oven-sh/setup-bun@v2");
  expect(steps[1]!.with).toEqual({ "bun-version": "1.4.4" });
  expect(steps[2]!.uses).toBe("actions/cache@v4");
  expect(steps[2]!.with).toMatchObject({ path: "~/.bun/install/cache" });
}

test("CI uses read-only permissions, cancels superseded branch runs and fans out five jobs", () => {
  expect(ci.permissions).toEqual({ contents: "read" });
  expect(ci.concurrency).toEqual({
    group: "ci-${{ github.ref }}",
    "cancel-in-progress": "${{ github.ref != 'refs/heads/main' }}",
  });
  expect(Object.keys(ci.jobs)).toEqual([
    "checks",
    "verify",
    "e2e",
    "clone",
    "demo",
  ]);
});

test("checks runs the fast parallel static gate on Linux without browsers", () => {
  expect(ci.jobs.checks!["runs-on"]).toBe("ubuntu-24.04");
  const steps = ci.jobs.checks!.steps;
  expectSetupSteps(steps);
  expect(steps.map((s) => s.run).filter(Boolean)).toEqual([
    "bun install --frozen-lockfile",
    "bun run verify:checks",
  ]);
});

test("verify runs across three systems with Bun 1.4.4, Chromium only and the full gate", () => {
  expect(ci.jobs.verify!.strategy!.matrix.os).toEqual(ALL_OS);
  expect(ci.jobs.verify!.strategy!["fail-fast"]).toBe(false);
  const steps = ci.jobs.verify!.steps;
  expectSetupSteps(steps);
  expect(steps.map((s) => s.run).filter(Boolean)).toEqual([
    "bun install --frozen-lockfile",
    "bun run --filter @manent/e2e install-browser chromium",
    "bun run verify",
  ]);
});

test("e2e fans out across three systems and three browser engines in parallel", () => {
  expect(ci.jobs.e2e!.strategy!.matrix).toEqual({
    os: ALL_OS,
    browser: ["chromium", "firefox", "webkit"],
  });
  expect(ci.jobs.e2e!.strategy!["fail-fast"]).toBe(false);
  const steps = ci.jobs.e2e!.steps;
  expectSetupSteps(steps);
  expect(steps.map((s) => s.run).filter(Boolean)).toEqual([
    "bun install --frozen-lockfile",
    "bun run --filter @manent/e2e install-browser ${{ matrix.browser }}",
    "bun run build:web",
    "bun run --filter @manent/e2e test --project ${{ matrix.browser }}",
  ]);
  expect(steps.at(-2)!.env).toEqual({ MANENT_FLAVOUR: "test" });
  expect(steps.at(-1)!.env).toEqual({ MANENT_FLAVOUR: "test" });
});

test("clone and demo run in parallel on three systems, installing only Chromium for demo", () => {
  expect(ci.jobs.clone!.strategy!.matrix.os).toEqual(ALL_OS);
  expect(ci.jobs.clone!.strategy!["fail-fast"]).toBe(false);
  expectSetupSteps(ci.jobs.clone!.steps);
  expect(ci.jobs.clone!.steps.map((s) => s.run).filter(Boolean)).toEqual([
    "bun install --frozen-lockfile",
    "bun run test:clone",
  ]);

  expect(ci.jobs.demo!.strategy!.matrix.os).toEqual(ALL_OS);
  expect(ci.jobs.demo!.strategy!["fail-fast"]).toBe(false);
  expectSetupSteps(ci.jobs.demo!.steps);
  expect(ci.jobs.demo!.steps.map((s) => s.run).filter(Boolean)).toEqual([
    "bun install --frozen-lockfile",
    "bun run --filter @manent/e2e install-browser chromium",
    "bun run seed:check",
    "bun run test:demo",
  ]);
});

test("pages deploys site/ on pushes to main touching site/** and manual dispatch, verifying site tests before upload", async () => {
  const pages = Bun.YAML.parse(
    await Bun.file(join(repoRoot, ".github/workflows/pages.yml")).text(),
  ) as {
    on: {
      push?: { branches: string[]; paths: string[] };
      workflow_dispatch?: unknown;
    };
    permissions: unknown;
    concurrency: { group: string; "cancel-in-progress": boolean };
    jobs: { deploy: { "runs-on": string; steps: Step[] } };
  };

  expect(pages.on.push).toEqual({ branches: ["main"], paths: ["site/**"] });
  expect("workflow_dispatch" in pages.on).toBe(true);
  expect(pages.permissions).toEqual({
    contents: "read",
    pages: "write",
    "id-token": "write",
  });
  expect(pages.concurrency).toEqual({
    group: "pages",
    "cancel-in-progress": false,
  });

  const steps = pages.jobs.deploy.steps;
  expect(steps[0]!.uses).toBe("actions/checkout@v5");
  expect(steps[0]!.with).toEqual({ "persist-credentials": false });

  const bunIdx = steps.findIndex(
    (s) =>
      s.uses === "oven-sh/setup-bun@v2" && s.with?.["bun-version"] === "1.4.4",
  );
  const testIdx = steps.findIndex(
    (s) => s.run === "bun test tools/test/site.test.ts",
  );
  const uploadIdx = steps.findIndex(
    (s) => s.uses === "actions/upload-pages-artifact@v4",
  );
  expect(bunIdx).toBeGreaterThan(0);
  expect(testIdx).toBeGreaterThan(bunIdx);
  expect(uploadIdx).toBeGreaterThan(testIdx);
});
