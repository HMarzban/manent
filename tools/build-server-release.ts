// Compiles the six release server binaries and archives the web app concurrently.
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const SERVER_RELEASE_TARGETS = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-windows-x64",
  "bun-windows-arm64",
] as const;

export type ServerReleaseTarget = (typeof SERVER_RELEASE_TARGETS)[number];

/** Returns the `bun build --compile` command for one server release target. */
export function serverCompileArgs(
  target: ServerReleaseTarget,
  outDir: string,
): string[] {
  return [
    "build",
    "--compile",
    "--minify",
    "--bytecode",
    "--format=esm",
    `--target=${target}`,
    "apps/server/src/main.ts",
    "apps/server/src/checkpoint-worker.ts",
    "--outfile",
    join(outDir, `manent-${target.slice("bun-".length)}`),
  ];
}

async function runChecked(
  cmd: string[],
  label: string,
  cwd: string,
): Promise<void> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${label} exited with code ${code}`);
}

async function buildRelease(outDir: string, cwd: string): Promise<void> {
  mkdirSync(join(cwd, outDir), { recursive: true });
  await Promise.all([
    ...SERVER_RELEASE_TARGETS.map((target) =>
      runChecked(
        [process.execPath, ...serverCompileArgs(target, outDir)],
        target,
        cwd,
      ),
    ),
    (async () => {
      await runChecked([process.execPath, "apps/web/build.ts"], "web", cwd);
      await runChecked(
        ["tar", "-czf", join(outDir, "manent-web.tar.gz"), "apps/web/dist"],
        "web-archive",
        cwd,
      );
    })(),
  ]);
}

if (import.meta.main) {
  const outDir = process.argv[2] ?? "server";
  await buildRelease(outDir, process.cwd());
}
