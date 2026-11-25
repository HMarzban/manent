// Publishes chosen result files unchanged under <outDir>/runs/ and writes <outDir>/report.md from
// every file there, refusing runs of uncommitted code or non-proof quick runs.

import { copyFile, mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { readResultFile } from "../result.ts";
import type { ResultFile } from "../result.ts";
import { reportOf, resultFilesIn } from "./generate.ts";

export interface PublishOptions {
  files: readonly string[];
  outDir: string;
  /** Directory holding `desktop-smoke-<platform>.json` files; defaults to `bench/results/desktop`. */
  smokeDir?: string;
}

export interface Published {
  report: string;
  runs: string[];
}

function assertPublishable(file: string, result: ResultFile): void {
  if (result.environment.dirty)
    throw new Error(
      `${file}: measured on uncommitted code; commit, run again, then publish`,
    );
  if (result.environment.mode === "quick" && !result.environment.prove)
    throw new Error(`${file}: a quick run judges nothing and is not published`);
}

function publishedName(file: string, result: ResultFile): string {
  const stem = basename(file, ".json");
  const { tier, throttle } = result.environment;
  return `${stem}-${tier}-${throttle}x.json`;
}

/**
 * Copies each result file unchanged into `<outDir>/runs/` and writes `<outDir>/report.md` from
 * every file there. Refuses dirty runs and quick runs without `environment.prove` before copying.
 */
export async function publishRuns(options: PublishOptions): Promise<Published> {
  const runsDir = join(options.outDir, "runs");
  const planned: { file: string; dest: string }[] = [];
  for (const file of options.files) {
    const result = await readResultFile(file);
    assertPublishable(file, result);
    planned.push({ file, dest: join(runsDir, publishedName(file, result)) });
  }
  await mkdir(runsDir, { recursive: true });
  for (const { file, dest } of planned) {
    if (resolve(file) !== resolve(dest)) await copyFile(file, dest);
  }
  const runs = await resultFilesIn(runsDir);
  const report = join(options.outDir, "report.md");
  await Bun.write(report, await reportOf(runs, options.smokeDir));
  return { report, runs };
}
