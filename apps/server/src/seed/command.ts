// The seed command: `seed --phase foreground|background --data-dir <dir> --seed-at <epoch ms> [--owner <pid>]`, run
// as a child process, which ends once its owner has.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  DEMO_SEED,
  SEED_DOCS,
  SEED_PROJECTS,
  SeedBuildError,
  SeedDriverError,
  buildSeed,
  createRng,
  seedProject,
} from "@manent/demo";
import type { SeedDriver, SeedStep, SkippedAction } from "@manent/demo";
import {
  STAGING_DONE,
  STAGING_RUN,
  readSeedRun,
  writeSeedRun,
} from "./adopt.ts";
import type { SeedRun } from "./adopt.ts";
import { stagingDirOf } from "./background.ts";
import { createSeedDriver } from "./driver.ts";
import { isFields } from "./link.ts";
import { createPageMeter } from "./page-meter.ts";
import { createSeedServer } from "./server.ts";

/** The disk's refusals, by the code the system gives them, and the clause each is told with. */
const DISK_REASONS: Readonly<Record<string, string>> = {
  ENOSPC: "there is no room to write it",
  EACCES: "the folder cannot be written to",
  EROFS: "the folder cannot be written to",
};
const UNEXPECTED = "something unexpected stopped it";

/** The project's title for a seed build's `where`: its guide's slug, then ": " and the detail. */
function titleOf(where: string): string {
  const slug = where.split(": ")[0] ?? where;
  return SEED_PROJECTS.find((p) => p.key.endsWith(`/${slug}`))?.title ?? slug;
}

/** The disk's refusal somewhere in the chain of causes; null when there is none. */
function diskReason(error: unknown): string | null {
  for (let at = error; isFields(at); at = at.cause) {
    if (at.code === "disk_full") return DISK_REASONS.ENOSPC!;
    const reason =
      typeof at.code === "string" ? DISK_REASONS[at.code] : undefined;
    if (reason !== undefined) return reason;
  }
  return null;
}

/** The one clause the child answers with, as the seed's failure is told on the terminal. */
function reasonOf(error: unknown, lastDocId: string | null): string {
  const disk = diskReason(error);
  if (disk !== null) return disk;
  if (error instanceof SeedBuildError) {
    const title = titleOf(error.where);
    return error.code === "generator_exhausted"
      ? `the text for '${title}' ran out of lines`
      : `'${title}' could not be laid out as its fixed pages need`;
  }
  if (error instanceof SeedDriverError && error.code === "timeout")
    return "the server did not answer in time";
  const doc = SEED_DOCS.find((d) => d.docId === lastDocId);
  if (
    error instanceof SeedDriverError &&
    error.code === "refused" &&
    doc !== undefined
  )
    return `the server refused a change to '${seedProject(doc.projectKey).title}'`;
  return UNEXPECTED;
}

/** The document an action's argument names: a document id, or a request that carries one. */
const docNamed = (arg: unknown): string | null =>
  typeof arg === "string"
    ? arg
    : isFields(arg) && typeof arg.docId === "string"
      ? arg.docId
      : null;

/** `driver`, telling `seen` each seeded document an action names, so a refusal can name its project. */
function watchDocuments(
  driver: SeedDriver,
  seen: (docId: string) => void,
): SeedDriver {
  return new Proxy(driver, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        for (const id of args.map(docNamed))
          if (id !== null && SEED_DOCS.some((d) => d.docId === id)) seen(id);
        return Reflect.apply(value, target, args);
      };
    },
  });
}

const isStep = (value: unknown): value is SeedStep =>
  isFields(value) &&
  typeof value.id === "string" &&
  typeof value.workspace === "string" &&
  typeof value.background === "boolean" &&
  typeof value.run === "function";

/** The steps the module at `path` exports as SEED_STEPS, in place of the package's. */
async function readSteps(path: string): Promise<SeedStep[]> {
  const module: unknown = await import(resolve(path));
  const steps = isFields(module) ? module.SEED_STEPS : null;
  if (!Array.isArray(steps) || !steps.every(isStep))
    throw new TypeError(`${path} does not export SEED_STEPS`);
  return steps;
}

/** The local offset east of UTC at `at`, in this machine's zone. */
const zoneOffsetAt = (at: number): number =>
  -new Date(at).getTimezoneOffset() * 60_000;

const PHASES = ["foreground", "background"] as const;
type Phase = (typeof PHASES)[number];

/** How often the background seed rewrites its record, as its work leaves it free to. */
const BEAT_EVERY_MS = 1_000;
/** How often the background seed's watch looks for its owner and its record. */
const WATCH_EVERY_MS = 100;

/**
 * Ends this process, from a thread of its own, once `owner` has exited or the record at `stagingDir`
 * is no longer its own (its folder moved away, removed, or claimed for another): building a project
 * can hold the seed's own thread for minutes, and Bun's --no-orphans waits for it too. A worker from
 * a file would need that file beside a compiled binary, so its few lines are given as text, which
 * holds `owner` as the safe integer or null it is.
 */
function watchSeed(owner: number | null, stagingDir: string): void {
  const watch = `import { readFileSync } from "node:fs";
const OWNER = ${JSON.stringify(owner)};
const isGone = (pid) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    // EPERM: it exists, run by another user; ESRCH: it has exited
    return error.code === "ESRCH";
  }
};
const isOwnRecord = () => {
  try {
    return JSON.parse(readFileSync(${JSON.stringify(join(stagingDir, STAGING_RUN))}, "utf8")).pid === process.pid;
  } catch {
    // no record there: the folder was moved away or removed
    return false;
  }
};
setInterval(() => {
  if ((OWNER !== null && isGone(OWNER)) || !isOwnRecord()) process.kill(process.pid, "SIGKILL");
}, ${WATCH_EVERY_MS});`;
  void new Worker(
    URL.createObjectURL(new Blob([watch], { type: "text/javascript" })),
    // the seed exits once its work is done, whatever the watch is doing
    { ref: false },
  );
}

/** The phase's steps through a seed server writing in `dir`; resolves with what the build could not do. */
async function seedPhase(
  options: {
    phase: Phase;
    dir: string;
    seedAt: number;
    /** Null: the package's own steps. */
    steps: readonly SeedStep[] | null;
  },
  seen: (docId: string) => void,
  onProgress: (done: number, total: number) => void,
): Promise<SkippedAction[]> {
  const { phase, dir, seedAt } = options;
  const rng = createRng(DEMO_SEED);
  const server = await createSeedServer({ dataDir: dir, seedAt, rng });
  const skipped: SkippedAction[] = [];
  try {
    const driver = createSeedDriver({
      target: server,
      random: () => rng.next(),
    });
    await buildSeed({
      phase,
      driver: watchDocuments(driver, seen),
      meter: createPageMeter(),
      seedAt,
      zoneOffsetMs: zoneOffsetAt(seedAt),
      onSkipped: (entry) => skipped.push(entry),
      onProgress,
      dataDir: dir,
      ...(options.steps === null ? {} : { steps: options.steps }),
    });
    await driver.writeEdits();
  } finally {
    await server.close();
  }
  return skipped;
}

/**
 * Rewrites the background seed's record with `change` and a new beat; once the record at its staging
 * path is no longer its own, the seed exits.
 */
type Tell = (change: Partial<Pick<SeedRun, "progress" | "failed">>) => void;

/**
 * The background seed's record in its staging folder, which it works inside from now on: a folder
 * removed under it (a reset) is never written again, even once a new one stands at the same path.
 * The server that started it claimed the folder for it in the record there; a seed started by hand
 * begins one, and one finding the folder claimed for another exits. It beats every BEAT_EVERY_MS its
 * work leaves it free to, and at each project; its watch ends it as `watchSeed` says.
 */
async function enterStaging(
  dataDir: string,
  owner: number | null,
): Promise<Tell> {
  const stagingDir = resolve(stagingDirOf(dataDir));
  await mkdir(stagingDir, { recursive: true });
  process.chdir(stagingDir);
  const startedAt = Date.now();
  const claimed = readSeedRun(".");
  if (claimed !== null && claimed.pid !== process.pid) process.exit(1);
  let run: SeedRun = claimed ?? {
    pid: process.pid,
    startedAt,
    beatAt: startedAt,
    progress: null,
    failed: null,
    owner,
  };
  const write = (base: SeedRun, change: Parameters<Tell>[0]) => {
    run = { ...base, ...change, beatAt: Date.now() };
    writeSeedRun(".", run);
  };
  write(run, {});
  watchSeed(owner, stagingDir);
  const tell: Tell = (change) => {
    const atPath = readSeedRun(stagingDir);
    try {
      // the server's claim may land after the seed's own first record: what stands there is the seed's to keep
      if (atPath?.pid === process.pid) {
        write(atPath, change);
        return;
      }
    } catch {
      // its folder was removed under it: nobody is left to tell
    }
    process.exit(1);
  };
  setInterval(() => tell({}), BEAT_EVERY_MS).unref();
  return tell;
}

/**
 * Seeds as `argv` says, starting with "seed"; resolves with the process's exit code. The foreground's
 * one line on stdout is `{"seedAt":…,"skipped":[…]}` or `{"failed":"<reason>"}`; the background keeps
 * its progress, then its failure, in its record and marks its staging whole once it is. The detail of a
 * failure goes to stderr. Without `--seed-at` the seed runs at the moment it starts; with `--owner` it
 * ends once that process has.
 */
export async function runSeedCommand(argv: readonly string[]): Promise<number> {
  let lastDocId: string | null = null;
  let tell: Tell | null = null;
  try {
    const { values } = parseArgs({
      args: argv.slice(1),
      options: {
        phase: { type: "string" },
        "data-dir": { type: "string" },
        "seed-at": { type: "string" },
        steps: { type: "string" },
        owner: { type: "string" },
      },
    });
    const dataDir = values["data-dir"];
    const phase = PHASES.find((p) => p === values.phase);
    if (phase === undefined || dataDir === undefined)
      throw new TypeError(
        `seed needs --phase foreground|background and --data-dir, not ${argv.join(" ")}`,
      );
    const seedAt =
      values["seed-at"] === undefined ? Date.now() : Number(values["seed-at"]);
    if (!Number.isSafeInteger(seedAt))
      throw new TypeError(
        `--seed-at must be epoch milliseconds, not ${values["seed-at"]}`,
      );
    const owner = values.owner === undefined ? null : Number(values.owner);
    if (owner !== null && !Number.isSafeInteger(owner))
      throw new TypeError(`--owner must be a process id, not ${values.owner}`);
    const steps =
      values.steps === undefined ? null : await readSteps(values.steps);
    if (phase === "background") tell = await enterStaging(dataDir, owner);
    const staged = tell;
    const skipped = await seedPhase(
      {
        phase,
        dir: staged === null ? join(dataDir, "data") : ".",
        seedAt,
        steps,
      },
      (docId) => {
        lastDocId = docId;
      },
      (done, total) => {
        // nothing hears the foreground's progress
        if (staged !== null) staged({ progress: { done, total } });
      },
    );
    if (staged !== null) await writeFile(STAGING_DONE, "");
    else console.log(JSON.stringify({ seedAt, skipped }));
    return 0;
  } catch (error) {
    const reason = reasonOf(error, lastDocId);
    tell?.({ failed: reason });
    console.log(JSON.stringify({ failed: reason }));
    const where = error instanceof SeedBuildError ? ` in ${error.where}` : "";
    const code =
      isFields(error) && typeof error.code === "string" ? error.code : "error";
    const stack = error instanceof Error ? error.stack : String(error);
    console.error(`${code}${where}\n${stack}`);
    return 1;
  }
}
