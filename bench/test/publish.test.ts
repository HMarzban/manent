import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { readComfortLimit } from "../report/comfort-limit.ts";
import { generateReport } from "../report/generate.ts";
import { publishRuns } from "../report/publish.ts";
import { readResultFile } from "../result.ts";

const repoRoot = join(import.meta.dir, "..", "..");
const fixtures = join(import.meta.dir, "fixtures", "report");

const trees = createTempTrees("manent-publish-");
afterAll(() => trees.removeAll());

test("published runs are copied unchanged and the report is regenerated from all of them", async () => {
  const dir = await trees.tree({});
  const outDir = join(dir, "benchmark");
  const smokeDir = join(dir, "smoke");
  const modest1x = join(fixtures, "d-modest-1x.json");
  const modest4x = join(fixtures, "d-modest-4x.json");

  const first = await publishRuns({ files: [modest1x], outDir, smokeDir });
  const firstDest = join(outDir, "runs", "d-modest-1x-D-modest-1x.json");
  expect(first).toEqual({
    report: join(outDir, "report.md"),
    runs: [firstDest],
  });
  expect(await Bun.file(firstDest).text()).toBe(
    await Bun.file(modest1x).text(),
  );

  const proof = structuredClone(await readResultFile(modest1x));
  proof.environment.mode = "quick";
  proof.environment.prove = true;
  proof.unproved = [{ scenario: "typing-120", metric: "dispatch" }];
  const proofPath = join(dir, "proof-run.json");
  await Bun.write(proofPath, `${JSON.stringify(proof, null, 2)}\n`);

  const second = await publishRuns({
    files: [modest4x, proofPath],
    outDir,
    smokeDir,
  });
  const secondDest = join(outDir, "runs", "d-modest-4x-D-modest-4x.json");
  const proofDest = join(outDir, "runs", "proof-run-D-modest-1x.json");
  expect(second).toEqual({
    report: join(outDir, "report.md"),
    runs: [firstDest, secondDest, proofDest],
  });
  expect(await Bun.file(firstDest).text()).toBe(
    await Bun.file(modest1x).text(),
  );
  expect(await Bun.file(secondDest).text()).toBe(
    await Bun.file(modest4x).text(),
  );
  expect(await Bun.file(proofDest).text()).toBe(
    await Bun.file(proofPath).text(),
  );

  const comfortLimitPages = await readComfortLimit(repoRoot);
  const expected = generateReport(
    [
      { file: firstDest, result: await readResultFile(firstDest) },
      { file: secondDest, result: await readResultFile(secondDest) },
      { file: proofDest, result: await readResultFile(proofDest) },
    ],
    [],
    { comfortLimitPages },
  );
  const written = await Bun.file(second.report).text();
  expect(written).toBe(expected);
  expect(written).toContain(
    "Proof run proof-run-D-modest-1x.json: it did not prove typing-120 dispatch, whose samples do not pass through the shared measuring path.",
  );
});

test("a run of uncommitted code or a quick run is not published", async () => {
  const modest1x = join(fixtures, "d-modest-1x.json");
  const base = await readResultFile(modest1x);

  const dirty = structuredClone(base);
  dirty.environment.dirty = true;
  const quick = structuredClone(base);
  quick.environment.mode = "quick";
  quick.environment.prove = false;

  const dir = await trees.tree({
    "dirty.json": `${JSON.stringify(dirty, null, 2)}\n`,
    "quick.json": `${JSON.stringify(quick, null, 2)}\n`,
  });
  const outDir = join(dir, "benchmark");
  const smokeDir = join(dir, "smoke");
  const dirtyPath = join(dir, "dirty.json");
  const quickPath = join(dir, "quick.json");

  await expect(
    publishRuns({ files: [modest1x, dirtyPath], outDir, smokeDir }),
  ).rejects.toThrow(
    `${dirtyPath}: measured on uncommitted code; commit, run again, then publish`,
  );
  await expect(
    publishRuns({ files: [modest1x, quickPath], outDir, smokeDir }),
  ).rejects.toThrow(
    `${quickPath}: a quick run judges nothing and is not published`,
  );
  expect(await Bun.file(join(outDir, "report.md")).exists()).toBe(false);
  expect(
    await Bun.file(
      join(outDir, "runs", "d-modest-1x-D-modest-1x.json"),
    ).exists(),
  ).toBe(false);
});

test("publishing keeps every row of every run", async () => {
  const dir = await trees.tree({});
  const outDir = join(dir, "benchmark");
  const smokeDir = join(dir, "smoke");
  const modest1x = join(fixtures, "d-modest-1x.json");
  const failed = join(fixtures, "failed.json");

  const published = await publishRuns({
    files: [modest1x, failed],
    outDir,
    smokeDir,
  });
  const modestDest = join(outDir, "runs", "d-modest-1x-D-modest-1x.json");
  const failedDest = join(outDir, "runs", "failed-D-typical-1x.json");
  expect(published).toEqual({
    report: join(outDir, "report.md"),
    runs: [modestDest, failedDest],
  });
  expect(await Bun.file(modestDest).text()).toBe(
    await Bun.file(modest1x).text(),
  );
  expect(await Bun.file(failedDest).text()).toBe(await Bun.file(failed).text());

  const report = await Bun.file(published.report).text();
  expect(report).toContain(
    "Hard fails: Typing — Keystroke to paint p50 / p95 / p99, at 120 and 2,000 pages.",
  );
  expect(report).toContain("| hard fail");
  expect(report).toContain("| over budget");
  expect(report).toContain("| undecided — too few samples");
  expect(report).toContain(
    "- export.pdf-120 on D-typical: could not finish: export.pdf-120 pdf_ms was budgeted and not measured.",
  );
  expect(report).toContain(
    "- typing-120 on D-typical: the machine was not quiet: load 3.4, calibration spread 1.6.",
  );
  expect(report).toContain(
    "- [d-modest-1x-D-modest-1x.json](runs/d-modest-1x-D-modest-1x.json)",
  );
  expect(report).toContain(
    "- [failed-D-typical-1x.json](runs/failed-D-typical-1x.json)",
  );
});
