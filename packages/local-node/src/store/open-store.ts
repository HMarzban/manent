// One store folder per store version: a newer build copies the store it finds and migrates the copy, never the original.
import { Database } from "bun:sqlite";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { STORE_MIGRATIONS, STORE_VERSION } from "./migrations.ts";

export type OpenedStore =
  | { ok: true; dir: string; version: number; migratedFrom: number | null }
  | { ok: false; reason: "newer_store" };

const STORE_FILE = "store.json";
const STORE_DIR = new RegExp("^store-([1-9][0-9]*)$");

const storeDir = (root: string, version: number): string =>
  join(root, `store-${version}`);

/** The `current` of store.json; null when it is missing or not well formed. */
function readCurrent(root: string): number | null {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(join(root, STORE_FILE), "utf8"));
  } catch {
    // Missing or damaged: the store folders on disk decide instead.
    return null;
  }
  if (typeof value !== "object" || value === null || !("current" in value))
    return null;
  const { current } = value;
  return typeof current === "number" &&
    Number.isSafeInteger(current) &&
    current >= 1
    ? current
    : null;
}

/** The highest store version on disk that is not above `version`; null when there is none. */
function newestUpTo(root: string, version: number): number | null {
  const found = readdirSync(root)
    .map((name) => STORE_DIR.exec(name)?.[1])
    .filter((n) => n !== undefined)
    .map(Number)
    .filter((n) => n <= version);
  return found.length === 0 ? null : Math.max(...found);
}

function writeCurrent(root: string, version: number): void {
  const path = join(root, STORE_FILE);
  writeFileSync(`${path}.tmp`, JSON.stringify({ current: version }));
  renameSync(`${path}.tmp`, path);
}

/** VACUUM INTO writes a consistent copy even while a WAL holds recent commits; read-only, it never checkpoints the source. */
function copyDatabase(from: string, to: string): void {
  const db = new Database(from, { readonly: true });
  try {
    db.run("VACUUM INTO ?1", [to]);
  } finally {
    db.close();
  }
}

/** Copies every `.sqlite` file under `from`, keeping the folders; nothing else is copied. */
function copyDatabases(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  if (!existsSync(from)) return;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    if (entry.isDirectory()) copyDatabases(source, join(to, entry.name));
    else if (entry.isFile() && entry.name.endsWith(".sqlite"))
      copyDatabase(source, join(to, entry.name));
  }
}

/**
 * Opens this build's store under `root`, copying an older one forward first. `openFiles` opens and closes
 * every file of a copied store with this build's drivers, so each runs its own migrations on the copy.
 * A migration that throws leaves `store-<version>.partial`, deleted at the next open, and passes the throw on.
 */
export function openStore(
  root: string,
  options: {
    openFiles(dir: string): void;
    version?: number;
    migrations?: Readonly<Record<number, (dir: string) => void>>;
    now?: () => number;
  },
): OpenedStore {
  const version = options.version ?? STORE_VERSION;
  mkdirSync(root, { recursive: true });
  const current = readCurrent(root) ?? newestUpTo(root, version);
  const dir = storeDir(root, version);
  if (current !== null && current > version && !existsSync(dir))
    return { ok: false, reason: "newer_store" };
  const partial = `${dir}.partial`;
  rmSync(partial, { recursive: true, force: true });
  let migratedFrom: number | null = null;
  if (current !== null && current < version) {
    copyDatabases(storeDir(root, current), partial);
    options.openFiles(partial);
    const migrations = options.migrations ?? STORE_MIGRATIONS;
    const steps = Object.keys(migrations)
      .map(Number)
      .filter((step) => step > current && step <= version)
      .toSorted((a, b) => a - b);
    for (const step of steps) migrations[step]?.(partial);
    if (existsSync(dir))
      renameSync(dir, `${dir}.superseded-${(options.now ?? Date.now)()}`);
    renameSync(partial, dir);
    migratedFrom = current;
  }
  mkdirSync(dir, { recursive: true });
  writeCurrent(root, version);
  return { ok: true, dir, version, migratedFrom };
}
