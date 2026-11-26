// Runs the three browser E2E engines concurrently, each on its own demo port and temp build folder.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const E2E_ENGINES = ["chromium", "firefox", "webkit"] as const;
export type E2eEngine = (typeof E2E_ENGINES)[number];

const DEFAULT_BASE_PORT = 4800;
const PORT_STRIDE = 10;

export interface EnginePlan {
  engine: E2eEngine;
  port: number;
  webDir: string;
  args: string[];
}

/** Builds per-engine port, build folder and Playwright argument lists. */
export function planE2eRuns(options: {
  basePort: number;
  webDirs: Readonly<Record<E2eEngine, string>>;
  extraArgs?: readonly string[];
}): EnginePlan[] {
  const extra = options.extraArgs ?? [];
  return E2E_ENGINES.map((engine, index) => ({
    engine,
    port: options.basePort + index * PORT_STRIDE,
    webDir: options.webDirs[engine],
    args: [
      "run",
      "--filter",
      "@manent/e2e",
      "test",
      "--project",
      engine,
      ...extra,
    ],
  }));
}

async function pipePrefixed(
  stream: ReadableStream<Uint8Array>,
  prefix: string,
  write: (chunk: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) write(`${prefix}${line}\n`);
    }
    const tail = buffered + decoder.decode();
    if (tail !== "") write(`${prefix}${tail}\n`);
  } finally {
    reader.releaseLock();
  }
}

async function runAll(extraArgs: readonly string[]): Promise<number> {
  const parsedPort = Number(process.env.MANENT_E2E_PORT);
  const basePort =
    Number.isInteger(parsedPort) && parsedPort > 0
      ? parsedPort
      : DEFAULT_BASE_PORT;
  const dirs = {
    chromium: mkdtempSync(join(tmpdir(), "manent-e2e-chromium-")),
    firefox: mkdtempSync(join(tmpdir(), "manent-e2e-firefox-")),
    webkit: mkdtempSync(join(tmpdir(), "manent-e2e-webkit-")),
  } satisfies Record<E2eEngine, string>;

  const plans = planE2eRuns({ basePort, webDirs: dirs, extraArgs });
  try {
    const results = await Promise.all(
      plans.map(async (plan) => {
        const prefix = `[${plan.engine}] `;
        const proc = Bun.spawn([process.execPath, ...plan.args], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            MANENT_FLAVOUR: "test",
            MANENT_E2E_PORT: String(plan.port),
            MANENT_WEB_DIR: plan.webDir,
          },
          stdout: "pipe",
          stderr: "pipe",
        });
        await Promise.all([
          pipePrefixed(proc.stdout, prefix, (s) => process.stdout.write(s)),
          pipePrefixed(proc.stderr, prefix, (s) => process.stderr.write(s)),
        ]);
        const code = await proc.exited;
        return { engine: plan.engine, code };
      }),
    );
    const nonZero = results.filter((r) => r.code !== 0);
    if (nonZero.length > 0) {
      for (const r of nonZero)
        console.error(`${r.engine} exited with code ${r.code}`);
      return nonZero[0]!.code;
    }
    return 0;
  } finally {
    for (const dir of Object.values(dirs))
      rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  process.exit(await runAll(process.argv.slice(2)));
}
