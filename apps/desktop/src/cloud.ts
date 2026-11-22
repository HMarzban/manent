// The installed demo's own server: the web server's entry run as a child process on a free loopback port.
import { cp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Each start takes a newly chosen free port. */
const CLOUD_START_ATTEMPTS = 3;
const HEALTH_POLL_MS = 100;
const CLOUD_START_LIMIT_MS = 30_000;
/** A packaged seed older than this is seeded again at first launch: its day would be days ago. */
const PACKAGED_SEED_MAX_AGE_MS = 21_600_000;
/** A seed still running this long is killed and counts as failed. */
const SEED_CHILD_TIMEOUT_MS = 120_000;
const TIMED_OUT = "the server did not answer in time";
const UNEXPECTED = "something unexpected stopped it";

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
  /** The clock a packaged seed's age is read with; absent, the system's. */
  now?: () => number;
}

/** The app's environment without its `MANENT_*` keys: the embedded cloud is configured by its four alone. */
function systemEnv(): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("MANENT_")),
  );
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
      ...systemEnv(),
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
 * Copies beside `dataDir` and renames the copy into place, so `dataDir` holds a whole seed or
 * nothing; what an interrupted copy left is removed first. A `dataDir` without `data/seed.json`
 * has never been served, so nothing in it is lost.
 */
async function copySeed(seedDir: string, dataDir: string): Promise<void> {
  const partial = `${dataDir}.partial`;
  await rm(partial, { recursive: true, force: true });
  await cp(seedDir, partial, { recursive: true });
  await rm(dataDir, { recursive: true, force: true });
  await rename(partial, dataDir);
}

const isFields = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The seed.json of a seed folder; null when there is none or it is not an object. */
async function readSeedFile(
  dir: string,
): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(join(dir, "data", "seed.json"), "utf8"),
    );
    return isFields(parsed) ? parsed : null;
  } catch {
    // no packaged seed.json, or a garbled one: there is no age to read
    return null;
  }
}

/** The seed command's answer line: what it seeded at, or the reason it stopped. */
function readSeedAnswer(stdout: string): Record<string, unknown> {
  try {
    const answer: unknown = JSON.parse(
      stdout.trimEnd().split("\n").at(-1) ?? "",
    );
    return isFields(answer) ? answer : { failed: UNEXPECTED };
  } catch {
    // a child that printed no answer stopped before it could give one
    return { failed: UNEXPECTED };
  }
}

/**
 * The embedded server's own foreground seed into `dataDir`, its data folder deleted first; then the
 * packaged seed.json with a new seed id and this seed's moment, renamed into place last. A seed that
 * does not finish leaves no data and rejects with the sentence the terminal shows.
 */
async function seedAgain(
  options: EmbeddedCloudOptions,
  packaged: Record<string, unknown>,
): Promise<void> {
  const data = join(options.dataDir, "data");
  await rm(data, { recursive: true, force: true });
  const child = Bun.spawn(
    [
      ...cloudCommand(options.execPath, options.entry),
      "seed",
      "--phase",
      "foreground",
      "--data-dir",
      options.dataDir,
    ],
    { env: systemEnv(), stdin: "ignore", stdout: "pipe", stderr: "ignore" },
  );
  const timer = setTimeout(() => child.kill("SIGKILL"), SEED_CHILD_TIMEOUT_MS);
  const stdout = await new Response(child.stdout).text();
  const code = await child.exited;
  clearTimeout(timer);
  const answer =
    child.signalCode === "SIGKILL"
      ? { failed: TIMED_OUT }
      : readSeedAnswer(stdout);
  if (
    code !== 0 ||
    typeof answer.failed === "string" ||
    !Number.isSafeInteger(answer.seedAt)
  ) {
    await rm(data, { recursive: true, force: true });
    const reason =
      typeof answer.failed === "string" ? answer.failed : UNEXPECTED;
    throw new Error(
      `Couldn't create the demo data: ${reason}. Run make reset to try again.`,
    );
  }
  const seed = {
    ...packaged,
    seedId: crypto.randomUUID(),
    seedAt: answer.seedAt,
    skipped: Array.isArray(answer.skipped) ? answer.skipped : [],
  };
  const path = join(data, "seed.json");
  await writeFile(`${path}.tmp`, JSON.stringify(seed, null, 2) + "\n");
  await rename(`${path}.tmp`, path);
}

/** A first launch: the packaged seed copied in, or seeded again when it is older than PACKAGED_SEED_MAX_AGE_MS. */
async function firstSeed(options: EmbeddedCloudOptions): Promise<void> {
  const packaged = await readSeedFile(options.seedDir);
  const seedAt = packaged?.seedAt;
  const now = options.now ?? Date.now;
  const old =
    typeof seedAt === "number" && now() - seedAt > PACKAGED_SEED_MAX_AGE_MS;
  if (old && packaged !== null) await seedAgain(options, packaged);
  else await copySeed(options.seedDir, options.dataDir);
}

/**
 * Copies `seedDir` into `dataDir` when `dataDir` has no `data/seed.json` (or, when the packaged seed
 * is older than six hours, seeds `dataDir` again with the server's own seed command), then runs the
 * server there and resolves once `/health` answers. A server that exits before it answers (its port
 * was taken in between) is started again on another port, up to three times; the rejection
 * names the last exit code. Rejects as well when nothing answers within 30 seconds, and with the
 * seed's own sentence when a seed again does not finish.
 */
export async function startEmbeddedCloud(
  options: EmbeddedCloudOptions,
): Promise<CloudProcess> {
  if (!(await Bun.file(join(options.dataDir, "data", "seed.json")).exists()))
    await firstSeed(options);
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
