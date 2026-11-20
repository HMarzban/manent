// The installed demo's own server: the web server's entry run as a child process on a free loopback port.
import { cp } from "node:fs/promises";
import { join } from "node:path";

/** Each start takes a newly chosen free port. */
const CLOUD_START_ATTEMPTS = 3;
const HEALTH_POLL_MS = 100;
const CLOUD_START_LIMIT_MS = 30_000;

export interface CloudProcess {
  /** `http://127.0.0.1:<port>`. */
  readonly url: string;
  /** Asks the server to finish its writes and exit, and resolves when it has. */
  stop(): Promise<void>;
}

/** `--no-orphans` ends the server with the app, however the app ends. */
export function cloudCommand(execPath: string, entry: string): string[] {
  return [execPath, "--no-orphans", entry];
}

interface EmbeddedCloudOptions {
  execPath: string;
  entry: string;
  dataDir: string;
  webDir: string;
  seedDir: string;
  /** A port free a moment ago; another process may take it before the server binds it. */
  freePort(): Promise<number>;
  fetch: typeof fetch;
}

type Attempt =
  { type: "ready"; cloud: CloudProcess } | { type: "exited"; code: number };

/** True when `/health` answers; false while nothing answers yet or `signal` aborts. */
async function answersHealth(
  url: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    return (await fetcher(`${url}/health`, { signal })).ok;
  } catch {
    // refused or aborted: the server is not listening yet, or has exited
    return false;
  }
}

/** One child on one port: ready when `/health` answers, exited when it ends first. Throws at `deadlineAt`. */
async function attempt(
  options: EmbeddedCloudOptions,
  deadlineAt: number,
): Promise<Attempt> {
  const port = await options.freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = Bun.spawn(cloudCommand(options.execPath, options.entry), {
    env: {
      ...process.env,
      MANENT_DEMO: "1",
      MANENT_PORT: String(port),
      MANENT_DATA_DIR: options.dataDir,
      MANENT_WEB_DIR: options.webDir,
    },
    stdio: ["ignore", "ignore", "ignore"],
  });
  const stop = async (): Promise<void> => {
    child.kill("SIGTERM");
    await child.exited;
  };
  const exited = child.exited.then((code): Attempt => ({
    type: "exited",
    code,
  }));
  while (Date.now() < deadlineAt) {
    const polling = new AbortController();
    const signal = AbortSignal.any([
      polling.signal,
      AbortSignal.timeout(deadlineAt - Date.now()),
    ]);
    const answered = answersHealth(url, options.fetch, signal).then(
      (ok): Attempt | null =>
        ok ? { type: "ready", cloud: { url, stop } } : null,
    );
    const outcome = await Promise.race([exited, answered]);
    polling.abort();
    if (outcome !== null) return outcome;
    await Bun.sleep(HEALTH_POLL_MS);
  }
  await stop();
  throw new Error(
    `the embedded cloud did not answer within ${CLOUD_START_LIMIT_MS} ms`,
  );
}

/**
 * Copies `seedDir` into `dataDir` when `dataDir` has no `data/seed.json`, then runs the server
 * there and resolves once `/health` answers. A server that exits before it answers (its port
 * was taken in between) is started again on another port, up to three times; the rejection
 * names the last exit code. Rejects as well when nothing answers within 30 seconds.
 */
export async function startEmbeddedCloud(
  options: EmbeddedCloudOptions,
): Promise<CloudProcess> {
  const { dataDir, seedDir } = options;
  if (!(await Bun.file(join(dataDir, "data", "seed.json")).exists()))
    await cp(seedDir, dataDir, { recursive: true });
  const deadlineAt = Date.now() + CLOUD_START_LIMIT_MS;
  let code = 0;
  for (let tried = 0; tried < CLOUD_START_ATTEMPTS; tried += 1) {
    const outcome = await attempt(options, deadlineAt);
    if (outcome.type === "ready") return outcome.cloud;
    code = outcome.code;
  }
  throw new Error(
    `the embedded cloud exited with code ${code} before it answered, ${CLOUD_START_ATTEMPTS} times`,
  );
}
