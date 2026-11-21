// The seed command: `seed --phase foreground|background --data-dir <dir> --seed-at <epoch ms>`, run as a child process.
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
import { createSeedDriver } from "./driver.ts";
import { isFields } from "./link.ts";
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

/** Small and Medium through a seed server on `<dataDir>/data`; resolves with what the build could not do. */
async function seedForeground(
  options: {
    dataDir: string;
    seedAt: number;
    /** Null: the package's own steps. */
    steps: readonly SeedStep[] | null;
  },
  seen: (docId: string) => void,
): Promise<SkippedAction[]> {
  const { dataDir, seedAt } = options;
  const rng = createRng(DEMO_SEED);
  const server = await createSeedServer({
    dataDir: join(dataDir, "data"),
    seedAt,
    rng,
  });
  const skipped: SkippedAction[] = [];
  try {
    const driver = createSeedDriver({
      target: server,
      random: () => rng.next(),
    });
    await buildSeed({
      phase: "foreground",
      driver: watchDocuments(driver, seen),
      seedAt,
      zoneOffsetMs: zoneOffsetAt(seedAt),
      onSkipped: (entry) => skipped.push(entry),
      dataDir: join(dataDir, "data"),
      ...(options.steps === null ? {} : { steps: options.steps }),
    });
  } finally {
    await server.close();
  }
  return skipped;
}

/**
 * Seeds as `argv` says, starting with "seed"; resolves with the process's exit code. Its one line on
 * stdout is `{"seedAt":…,"skipped":[…]}` or `{"failed":"<reason>"}`; the detail of a failure goes to
 * stderr. Without `--seed-at` the seed runs at the moment it starts.
 */
export async function runSeedCommand(argv: readonly string[]): Promise<number> {
  let lastDocId: string | null = null;
  try {
    const { values } = parseArgs({
      args: argv.slice(1),
      options: {
        phase: { type: "string" },
        "data-dir": { type: "string" },
        "seed-at": { type: "string" },
        steps: { type: "string" },
      },
    });
    const dataDir = values["data-dir"];
    if (values.phase !== "foreground" || dataDir === undefined)
      throw new TypeError(
        `seed needs --phase foreground and --data-dir, not ${argv.join(" ")}`,
      );
    const seedAt =
      values["seed-at"] === undefined ? Date.now() : Number(values["seed-at"]);
    if (!Number.isSafeInteger(seedAt))
      throw new TypeError(
        `--seed-at must be epoch milliseconds, not ${values["seed-at"]}`,
      );
    const steps =
      values.steps === undefined ? null : await readSteps(values.steps);
    const skipped = await seedForeground(
      { dataDir, seedAt, steps },
      (docId) => {
        lastDocId = docId;
      },
    );
    console.log(JSON.stringify({ seedAt, skipped }));
    return 0;
  } catch (error) {
    console.log(JSON.stringify({ failed: reasonOf(error, lastDocId) }));
    const where = error instanceof SeedBuildError ? ` in ${error.where}` : "";
    const code =
      isFields(error) && typeof error.code === "string" ? error.code : "error";
    const stack = error instanceof Error ? error.stack : String(error);
    console.error(`${code}${where}\n${stack}`);
    return 1;
  }
}
