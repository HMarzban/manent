// The foreground seed of `make demo`, Small and Medium, timed from an empty data folder to its seed.json.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Measurement, Scenario } from "../harness.ts";

const ROOT = join(import.meta.dir, "..", "..");
const RUNS = 3;

/**
 * How long `ensureSeed` takes on the fresh folder `dir`, in milliseconds. It runs in a process of
 * its own, which times it and prints the figure, since the bench never imports the tools.
 */
async function timedSeed(dir: string): Promise<number> {
  const code = [
    `const { ensureSeed } = await import("./tools/demo/seed.ts");`,
    "const startedAt = performance.now();",
    `await ensureSeed(${JSON.stringify(dir)});`,
    "console.log(performance.now() - startedAt);",
  ].join("\n");
  const child = Bun.spawn([process.execPath, "-e", code], {
    cwd: ROOT,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
  });
  const printed = await new Response(child.stdout).text();
  const exitCode = await child.exited;
  const ms = Number(printed.trim());
  if (exitCode !== 0 || !Number.isFinite(ms))
    throw new Error(`the seed exited ${exitCode}, printing ${printed}`);
  return ms;
}

export default {
  id: "demo.seed",
  workload: null,
  processes: 1,
  async run(): Promise<Measurement[]> {
    const samples: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const dir = await mkdtemp(join(tmpdir(), "manent-seed-bench-"));
      try {
        samples.push(await timedSeed(dir));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
    return [{ metric: "foreground_ms", unit: "ms", samples }];
  },
} satisfies Scenario;
