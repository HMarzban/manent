// The demo's data/seed.json: written last, once the seed command has seeded the data folder whole;
// kept while the build seeds the same content, replaced by a reset.
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SEED_CAPABILITIES, buildSeed } from "@manent/demo";
import type { SeedManifest, SkippedAction } from "@manent/demo";

export interface SeedFile {
  /** A new random UUID on every seeding, so that a client can tell one seed from the next. */
  seedId: string;
  fingerprint: string;
  manifest: SeedManifest;
  /** The moment the data was seeded at, epoch ms. */
  seedAt: number;
  /** What this build's server could not do, and so left out. */
  skipped: SkippedAction[];
}

/** A seed that did not finish: `reason` is one clause; the message is the sentence the terminal shows. */
export class SeedCommandError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(
      `Couldn't create the demo data: ${reason}. Run make reset to try again.`,
    );
    this.name = "SeedCommandError";
    this.reason = reason;
  }
}

const ROOT = join(import.meta.dir, "..", "..");
/** A foreground seed still running this long is killed and counts as failed. */
const SEED_CHILD_TIMEOUT_MS = 240_000;
const TIMED_OUT = "the server did not answer in time";
const UNEXPECTED = "something unexpected stopped it";

const isFields = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isSkipped = (value: unknown): value is SkippedAction =>
  isFields(value) &&
  typeof value.step === "string" &&
  SEED_CAPABILITIES.some((c) => c === value.capability) &&
  typeof value.what === "string";

/** SHA-256 of the manifest's JSON, in hex. */
export function seedFingerprint(manifest: SeedManifest): string {
  return new Bun.CryptoHasher("sha256")
    .update(JSON.stringify(manifest))
    .digest("hex");
}

/** The seed command's one line: what it seeded, or the reason it gives for failing; a reason of its own for anything else. */
function readAnswer(
  stdout: string,
): { seedAt: number; skipped: SkippedAction[] } | { failed: string } {
  let answer: unknown;
  try {
    answer = JSON.parse(stdout.trimEnd().split("\n").at(-1) ?? "");
  } catch {
    // a child that printed no answer stopped before it could give one
    return { failed: UNEXPECTED };
  }
  if (!isFields(answer)) return { failed: UNEXPECTED };
  if (typeof answer.failed === "string") return { failed: answer.failed };
  const { seedAt, skipped } = answer;
  if (!Number.isSafeInteger(seedAt) || !Array.isArray(skipped))
    return { failed: UNEXPECTED };
  return skipped.every(isSkipped)
    ? { seedAt: Number(seedAt), skipped }
    : { failed: UNEXPECTED };
}

/**
 * Runs the foreground seed into `<dataDir>/data` as a child process, at `seedAt` or, when null, at
 * the moment it starts; SeedCommandError when it does not finish.
 */
export async function runSeedChild(
  dataDir: string,
  seedAt: number | null,
): Promise<{ seedAt: number; skipped: SkippedAction[] }> {
  const at = seedAt === null ? [] : ["--seed-at", String(seedAt)];
  const child = Bun.spawn(
    [
      process.execPath,
      "apps/server/src/main.ts",
      "seed",
      "--phase",
      "foreground",
      "--data-dir",
      resolve(dataDir),
      ...at,
    ],
    { cwd: ROOT, stdin: "ignore", stdout: "pipe", stderr: "ignore" },
  );
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, SEED_CHILD_TIMEOUT_MS);
  const stdout = await new Response(child.stdout).text();
  const code = await child.exited;
  clearTimeout(timer);
  if (timedOut) throw new SeedCommandError(TIMED_OUT);
  const answer = readAnswer(stdout);
  if ("failed" in answer) throw new SeedCommandError(answer.failed);
  if (code !== 0) throw new SeedCommandError(UNEXPECTED);
  return answer;
}

/** Writes seed.json beside itself, then renames it into place, so it exists only for a whole seed. */
async function writeSeedFile(dataDir: string, file: SeedFile): Promise<void> {
  const path = join(dataDir, "data", "seed.json");
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(file, null, 2) + "\n");
  await rename(temporary, path);
}

/** Deletes `<dataDir>/data`, whatever a stopped seed left there, and seeds it again; on failure nothing is left. */
async function seedAgain(
  dataDir: string,
  manifest: SeedManifest,
): Promise<SeedFile> {
  const data = join(dataDir, "data");
  await rm(data, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
  try {
    const { seedAt, skipped } = await runSeedChild(dataDir, null);
    const file: SeedFile = {
      seedId: crypto.randomUUID(),
      fingerprint: seedFingerprint(manifest),
      manifest,
      seedAt,
      skipped,
    };
    await writeSeedFile(dataDir, file);
    return file;
  } catch (error) {
    await rm(data, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
    throw error;
  }
}

/** The fingerprint stored in seed.json; null when the file cannot be parsed or holds none. Throws when there is no file. */
async function readStoredFingerprint(path: string): Promise<string | null> {
  const text = await readFile(path, "utf8");
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    // a truncated or garbled file is stale, which the caller resets
    return null;
  }
  if (!isFields(stored)) return null;
  return typeof stored.fingerprint === "string" ? stored.fingerprint : null;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Seeds `dataDir` when it has no seed; "stale" when its seed was built otherwise, which is left
 * for the caller to reset. A complete seed is kept whatever its age. SeedCommandError when the
 * seed does not finish.
 */
export async function ensureSeed(
  dataDir: string,
): Promise<"created" | "present" | "stale"> {
  const manifest = await buildSeed();
  let stored: string | null;
  try {
    stored = await readStoredFingerprint(join(dataDir, "data", "seed.json"));
  } catch (error) {
    if (!isMissing(error)) throw error;
    await seedAgain(dataDir, manifest);
    return "created";
  }
  return stored === seedFingerprint(manifest) ? "present" : "stale";
}

/** Deletes `<dataDir>/data` and seeds it again, with a new seed id. SeedCommandError when the seed does not finish. */
export async function resetSeed(dataDir: string): Promise<SeedFile> {
  return seedAgain(dataDir, await buildSeed());
}
