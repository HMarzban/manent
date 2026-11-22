// Seeds two temporary folders and compares them: every seeded document's text, and its versions.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SEED_DOCS } from "@manent/demo";
import { contentAt } from "@manent/server-core";
import { openSqliteStorage } from "@manent/storage";
import type { Storage, VersionRow } from "@manent/storage";
import { runSeedChild } from "./seed.ts";

/** Versions read from one document's history at a time. */
const PAGE_ROWS = 500;

/** The document's canonical text and settings as its log holds them; null when it is not placed. */
function textOf(storage: Storage, docId: string): string | null {
  const place = storage.directory.placeOf(docId);
  if (place === null) return null;
  const file = storage.open(place.home);
  const row = file.log.get(docId);
  if (row === null) return null;
  const at = { generation: row.generation, seq: row.headSeq };
  const content = contentAt(file, docId, at);
  return JSON.stringify({
    blocks: content?.blocks,
    settings: content?.settings,
  });
}

/** Every version of the document, newest first; none when it is not placed. */
function versionsOf(storage: Storage, docId: string): VersionRow[] {
  const place = storage.directory.placeOf(docId);
  if (place === null) return [];
  const { history } = storage.open(place.home);
  const found: VersionRow[] = [];
  for (;;) {
    const last = found.at(-1);
    const before =
      last === undefined ? null : { createdAt: last.createdAt, id: last.id };
    const page = history.page(docId, before, PAGE_ROWS);
    found.push(...page);
    if (page.length < PAGE_ROWS) return found;
  }
}

/** The same version, its time moved by `shiftMs`. */
const isSameVersion = (
  a: VersionRow,
  b: VersionRow,
  shiftMs: number,
): boolean =>
  a.kind === b.kind &&
  a.name === b.name &&
  a.createdByUserId === b.createdByUserId &&
  b.createdAt - a.createdAt === shiftMs;

/** What differs between two seeded data folders, one line each, when the second was seeded `shiftMs` later. */
function compare(a: Storage, b: Storage, shiftMs: number): string[] {
  const found: string[] = [];
  for (const { key, docId } of SEED_DOCS) {
    if (textOf(a, docId) !== textOf(b, docId))
      found.push(`The text of ${key} differs.`);
    const before = versionsOf(a, docId);
    const after = versionsOf(b, docId);
    if (before.length !== after.length)
      found.push(
        `${key} has ${before.length} versions in one seed and ${after.length} in the other.`,
      );
    else
      before.forEach((version, i) => {
        if (!isSameVersion(version, after[i]!, shiftMs))
          found.push(`Version ${i + 1} of ${key} differs.`);
      });
  }
  return found;
}

/**
 * Seeds one temporary folder at `firstAt` and another at `secondAt`, and says what differs beyond
 * the shift in their times: [] when the seeds are the same. The folders are removed.
 */
export async function compareSeeds(
  firstAt: number,
  secondAt: number,
): Promise<string[]> {
  const dirs = await Promise.all(
    [1, 2].map(() => mkdtemp(join(tmpdir(), "manent-seed-check-"))),
  );
  try {
    await runSeedChild(dirs[0]!, firstAt);
    await runSeedChild(dirs[1]!, secondAt);
    const [first, second] = dirs.map((dir) =>
      openSqliteStorage({ dir: join(dir, "data"), now: () => 0 }),
    );
    try {
      return compare(first!, second!, secondAt - firstAt);
    } finally {
      first!.close();
      second!.close();
    }
  } finally {
    await Promise.all(
      dirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  }
}

if (import.meta.main) {
  const at = Date.now();
  const differences = await compareSeeds(at, at);
  if (differences.length === 0)
    console.log("Two seeds from one moment are the same.");
  for (const line of differences) console.log(line);
  process.exit(differences.length === 0 ? 0 : 1);
}
