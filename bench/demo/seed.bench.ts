// The seeds of `make demo`: Small and Medium from an empty data folder to its seed.json, then
// Lanternfield Studios' background seed into the same folder, run to its end.
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

/** How long the background seed takes to run to its end in `dir`, in milliseconds. */
async function timedStudio(dir: string): Promise<number> {
  const startedAt = performance.now();
  const child = Bun.spawn(
    [
      process.execPath,
      "apps/server/src/main.ts",
      "seed",
      "--phase",
      "background",
      "--data-dir",
      dir,
    ],
    {
      cwd: ROOT,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "inherit",
      ipc() {},
    },
  );
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`the background seed exited ${exitCode}`);
  return performance.now() - startedAt;
}

export default {
  id: "demo.seed",
  workload: null,
  processes: 1,
  async run(): Promise<Measurement[]> {
    const foreground: number[] = [];
    const studio: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const dir = await mkdtemp(join(tmpdir(), "manent-seed-bench-"));
      try {
        foreground.push(await timedSeed(dir));
        studio.push(await timedStudio(dir));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
    return [
      { metric: "foreground_ms", unit: "ms", samples: foreground },
      { metric: "studio_ms", unit: "ms", samples: studio },
    ];
  },
} satisfies Scenario;
