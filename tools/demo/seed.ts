// The demo's data/seed.json: written once, kept while the build seeds the same content, replaced by a reset.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildSeed } from "@manent/demo";
import type { SeedManifest } from "@manent/demo";

export interface SeedFile {
  /** A new random UUID on every seeding, so that a client can tell one seed from the next. */
  seedId: string;
  fingerprint: string;
  manifest: SeedManifest;
}

/** SHA-256 of the manifest's JSON, in hex. */
export function seedFingerprint(manifest: SeedManifest): string {
  return new Bun.CryptoHasher("sha256")
    .update(JSON.stringify(manifest))
    .digest("hex");
}

/** The foreground seed of `dataDir`, built as this build builds it. */
async function buildFile(dataDir: string): Promise<SeedFile> {
  const manifest = await buildSeed({ dataDir: join(dataDir, "data") });
  return {
    seedId: crypto.randomUUID(),
    fingerprint: seedFingerprint(manifest),
    manifest,
  };
}

async function writeSeedFile(dataDir: string, file: SeedFile): Promise<void> {
  await mkdir(join(dataDir, "data"), { recursive: true });
  await writeFile(
    join(dataDir, "data", "seed.json"),
    JSON.stringify(file, null, 2) + "\n",
  );
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
  if (
    typeof stored !== "object" ||
    stored === null ||
    !("fingerprint" in stored)
  )
    return null;
  return typeof stored.fingerprint === "string" ? stored.fingerprint : null;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Seeds `dataDir` when it has no seed; "stale" when its seed was built otherwise, which is left for the caller to reset. */
export async function ensureSeed(
  dataDir: string,
): Promise<"created" | "present" | "stale"> {
  const file = await buildFile(dataDir);
  let stored: string | null;
  try {
    stored = await readStoredFingerprint(join(dataDir, "data", "seed.json"));
  } catch (error) {
    if (!isMissing(error)) throw error;
    await writeSeedFile(dataDir, file);
    return "created";
  }
  return stored === file.fingerprint ? "present" : "stale";
}

/** Deletes `<dataDir>/data` and seeds it again, with a new seed id. */
export async function resetSeed(dataDir: string): Promise<SeedFile> {
  await rm(join(dataDir, "data"), { recursive: true, force: true });
  const file = await buildFile(dataDir);
  await writeSeedFile(dataDir, file);
  return file;
}
