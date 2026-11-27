// Runs each tier of a benchmark run, on this machine or in a container capped to the tier's limits,
// and records a tier that cannot run as not measured, with the reason, before going on to the next.

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { commandLine, readSource } from "../env.ts";
import { runSuite } from "../harness.ts";
import { readQuiet } from "../measure.ts";
import { readResultFile, writeResultFile } from "../result.ts";
import { TIERS, dockerRunArgs, toGigabytes } from "./tiers.ts";
import type { Tier, TierId } from "./tiers.ts";

/** Runs the `docker` command with `args`; `missing` when there is no such command. */
export type Docker = (
  args: readonly string[],
) => Promise<{ exitCode: number; output: string } | { missing: true }>;

export interface TierRun {
  tier: TierId;
  throttle: 1 | 4 | 6;
  /** Only scenarios whose path contains it; null for every scenario of the tier's areas. */
  filter: string | null;
}

interface Options {
  root: string;
  outDir: string;
  runs: readonly TierRun[];
  mode: "quick" | "standard" | "full";
  prove: boolean;
  docker: Docker;
}

const NOT_INSTALLED =
  "Docker is not installed, so the Docker tiers are recorded as not measured. Install Docker and run bun run bench again to measure them.";
const NOT_RUNNING =
  "Docker is not running, so the Docker tiers are recorded as not measured. Start Docker and run bun run bench again to measure them.";

const REPO = join(import.meta.dir, "..", "..");

/** Whether docker exited 0, and what it printed: nothing when there is no docker command. */
async function ask(
  docker: Docker,
  args: readonly string[],
): Promise<{ ok: boolean; output: string }> {
  const ran = await docker(args);
  if ("missing" in ran) return { ok: false, output: "" };
  return { ok: ran.exitCode === 0, output: ran.output };
}

/** The last line a command printed, without its line break. */
export function lastLine(output: string): string {
  return output.trimEnd().split("\n").at(-1) ?? "";
}

/** Null when a Docker daemon answers; otherwise the line that says why not, printed once. */
async function checkDaemon(docker: Docker): Promise<string | null> {
  const ran = await docker(["version", "--format", "{{.Server.Version}}"]);
  if ("missing" in ran) return NOT_INSTALLED;
  return ran.exitCode === 0 ? null : NOT_RUNNING;
}

/** Null when Docker offers at least `tier`'s caps; otherwise why the tier cannot run. */
async function checkResources(
  docker: Docker,
  tier: Tier,
): Promise<string | null> {
  const info = await ask(docker, [
    "info",
    "--format",
    "{{.NCPU}} {{.MemTotal}}",
  ]);
  if (!info.ok) return NOT_RUNNING;
  const [cpus = 0, memoryBytes = 0] = info.output.trim().split(" ").map(Number);
  if (cpus >= (tier.cpus ?? 0) && memoryBytes >= (tier.memoryBytes ?? 0))
    return null;
  return `Docker offers ${cpus} cores and ${toGigabytes(memoryBytes)} GB; this tier needs ${tier.cpus} and ${toGigabytes(tier.memoryBytes ?? 0)}`;
}

type Outcome<T> = T | { reason: string };

/** The tier image of this lockfile and commit, built when Docker does not hold it. */
async function ensureImage(
  docker: Docker,
): Promise<Outcome<{ image: string }>> {
  const { commit, dirty } = readSource();
  const hash = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(join(REPO, "bun.lock")).bytes())
    .update(commit)
    .digest("hex");
  const image = `manent-bench:${hash.slice(0, 12)}`;
  if ((await ask(docker, ["image", "inspect", image])).ok) return { image };
  const built = await ask(docker, [
    "build",
    "--build-arg",
    `MANENT_BENCH_COMMIT=${commit}`,
    "--build-arg",
    `MANENT_BENCH_DIRTY=${dirty}`,
    "-f",
    join(import.meta.dir, "Dockerfile"),
    "-t",
    image,
    REPO,
  ]);
  return built.ok
    ? { image }
    : {
        reason: `the tier image could not be built: ${lastLine(built.output)}`,
      };
}

/** The flags a container's run is given: the mode, the proof, the filter and the host's command line. */
function insideArgs(options: Options, run: TierRun): string[] {
  return [
    ...(options.mode === "standard" ? [] : [`--${options.mode}`]),
    ...(options.prove ? ["--prove"] : []),
    ...(run.filter === null ? [] : ["--filter", run.filter]),
    "--command",
    commandLine(),
  ];
}

/** Runs `run` in its tier's container and keeps the result file it wrote. */
async function runContainer(
  options: Options,
  run: TierRun,
  image: string,
): Promise<Outcome<{ file: string }>> {
  await mkdir(options.outDir, { recursive: true });
  // Docker mounts an absolute path only.
  const resultsDir = await mkdtemp(
    join(resolve(options.outDir), ".container-"),
  );
  try {
    const tracesDir = join(REPO, "bench", "corpus", "traces");
    const cacheDir = join(REPO, "bench", "corpus", "cache");
    await mkdir(cacheDir, { recursive: true });
    const readOnly = existsSync(tracesDir)
      ? [{ from: tracesDir, to: "/repo/bench/corpus/traces" }]
      : [];
    const readWrite = [{ from: cacheDir, to: "/repo/bench/corpus/cache" }];
    const soakMinutes = process.env.MANENT_SOAK_MINUTES;
    const args = dockerRunArgs(TIERS[run.tier], {
      image,
      throttle: run.throttle,
      resultsDir,
      readOnly,
      readWrite,
      ...(soakMinutes === undefined || soakMinutes === ""
        ? {}
        : { soakMinutes }),
      args: insideArgs(options, run),
    });
    const ran = await ask(options.docker, args.slice(1));
    const written = (await readdir(resultsDir)).find((f) =>
      f.endsWith(".json"),
    );
    if (written === undefined)
      return {
        reason: `the container stopped before writing results: ${lastLine(ran.output)}`,
      };
    const result = await readResultFile(join(resultsDir, written));
    return { file: await writeResultFile(options.outDir, result) };
  } finally {
    await rm(resultsDir, { recursive: true, force: true });
  }
}

/** What one run of the tiers learns of Docker once: whether its daemon answers, and the tier image. */
interface Learnt {
  daemon: Promise<string | null> | null;
  image: Promise<Outcome<{ image: string }>> | null;
}

/** Runs `run` in its capped tier's container, or says why it cannot. */
async function runCapped(
  options: Options,
  run: TierRun,
  learnt: Learnt,
): Promise<Outcome<{ file: string }>> {
  learnt.daemon ??= checkDaemon(options.docker).then((line) => {
    if (line !== null) console.log(line);
    return line;
  });
  const down = await learnt.daemon;
  if (down !== null) return { reason: down };
  const short = await checkResources(options.docker, TIERS[run.tier]);
  if (short !== null) return { reason: short };
  learnt.image ??= ensureImage(options.docker);
  const ready = await learnt.image;
  if ("reason" in ready) return ready;
  return runContainer(options, run, ready.image);
}

/**
 * Runs each of `runs` in order and returns their result files, one each. A tier with no caps runs
 * here; a capped tier runs in its container, and when it cannot (no Docker, too few resources, no
 * image, no result) its file records every scenario of its areas as not measured, with the reason.
 */
export async function runTiers(options: Options): Promise<string[]> {
  const learnt: Learnt = { daemon: null, image: null };
  const files: string[] = [];
  for (const run of options.runs) {
    const tier = TIERS[run.tier];
    const suite = {
      root: options.root,
      outDir: options.outDir,
      tier: run.tier,
      throttle: run.throttle,
      mode: options.mode,
      prove: options.prove,
      areas: tier.areas,
      ...(run.filter === null ? {} : { filter: run.filter }),
    };
    if (tier.cpus === null) {
      files.push((await runSuite({ ...suite, quiet: readQuiet })).file);
      continue;
    }
    const ran = await runCapped(options, run, learnt);
    if ("file" in ran) files.push(ran.file);
    else files.push((await runSuite({ ...suite, cannotRun: ran.reason })).file);
  }
  return files;
}
