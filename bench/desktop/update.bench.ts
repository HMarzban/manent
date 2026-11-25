// Local desktop update timing: runs tools/desktop/smoke.ts against an installed local macOS build
// and a local update directory (never GitHub), or reads a pre-produced local smoke JSON file,
// emitting update_ms. Throws NotMeasured whenever a local prerequisite is absent.
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NotMeasured } from "../env.ts";
import type { Measurement, Scenario } from "../harness.ts";
import { measurement } from "../measure.ts";

const REPO_ROOT = join(import.meta.dir, "../..");
const SMOKE_ENTRY = join(REPO_ROOT, "tools/desktop/smoke.ts");

function readUpdateMs(raw: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !("updateMs" in parsed))
    return null;
  const { updateMs } = parsed;
  if (
    typeof updateMs !== "number" ||
    !Number.isFinite(updateMs) ||
    updateMs < 0
  )
    return null;
  return updateMs;
}

function envPath(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function hasUpdateManifest(dir: string): boolean {
  return readdirSync(dir).some((entry) => entry.endsWith("-update.json"));
}

async function measureFromSmokeFile(smokePath: string): Promise<Measurement[]> {
  if (!existsSync(smokePath))
    throw new NotMeasured(`local desktop smoke file not found at ${smokePath}`);
  const updateMs = readUpdateMs(await readFile(smokePath, "utf8"));
  if (updateMs === null)
    throw new NotMeasured(
      `local desktop smoke file at ${smokePath} has no numeric updateMs`,
    );
  return [measurement("update_ms", "ms", [updateMs])];
}

async function measureFromLocalBuild(
  appPath: string,
  updateDir: string,
): Promise<Measurement[]> {
  if (!existsSync(appPath))
    throw new NotMeasured(`installed desktop app not found at ${appPath}`);
  if (!existsSync(updateDir))
    throw new NotMeasured(`local update directory not found at ${updateDir}`);
  if (!hasUpdateManifest(updateDir))
    throw new NotMeasured(
      `local update directory at ${updateDir} contains no *-update.json manifest`,
    );
  const workDir = await mkdtemp(join(tmpdir(), "manent-desktop-update-"));
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        SMOKE_ENTRY,
        "--app",
        appPath,
        "--update-from",
        updateDir,
      ],
      {
        cwd: workDir,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      child.exited,
    ]);
    const writtenPath = join(
      workDir,
      "results",
      `desktop-smoke-${process.platform}.json`,
    );
    const raw = existsSync(writtenPath)
      ? await readFile(writtenPath, "utf8")
      : stdout;
    const updateMs = readUpdateMs(raw);
    if (exitCode !== 0 || updateMs === null)
      throw new NotMeasured(
        `local desktop smoke did not yield an updateMs reading (exit ${exitCode})`,
      );
    return [measurement("update_ms", "ms", [updateMs])];
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function measure(): Promise<Measurement[]> {
  if (process.platform !== "darwin")
    throw new NotMeasured("local desktop update timing runs on macOS only");

  const smokeFile = envPath("MANENT_BENCH_DESKTOP_SMOKE");
  if (smokeFile !== null) return measureFromSmokeFile(smokeFile);

  const appPath = envPath("MANENT_BENCH_DESKTOP_APP");
  const updateDir = envPath("MANENT_BENCH_UPDATE_DIR");
  if (appPath === null || updateDir === null)
    throw new NotMeasured(
      "no local desktop app and update directory provided (set MANENT_BENCH_DESKTOP_APP and MANENT_BENCH_UPDATE_DIR, or MANENT_BENCH_DESKTOP_SMOKE)",
    );

  return measureFromLocalBuild(appPath, updateDir);
}

const scenario: Scenario = {
  id: "desktop.update",
  workload: null,
  processes: 1,
  run: measure,
};

export default scenario;
