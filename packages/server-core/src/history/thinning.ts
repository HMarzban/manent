// Which automatic versions are kept as they age: all of the last day, the newest of each hour for
// thirty days, then the newest of each day, in UTC buckets.
import type { VersionKind, VersionRow } from "@manent/storage";

/** Every automatic version younger than this is kept. */
export const KEEP_ALL_MS = 86_400_000;
/** Younger than this, and not younger than KEEP_ALL_MS: the newest of each hour is kept; older, the newest of each day. */
export const KEEP_HOURLY_MS = 2_592_000_000;
const HOUR_MS = 3_600_000;

/** The kinds kept forever; every other kind is automatic. */
const KEPT_KINDS: ReadonlySet<VersionKind> = new Set<VersionKind>([
  "named",
  "sent",
  "revision_issue",
  "revision_baseline",
  "recovered",
]);

/** Newer first: by creation, then by id. */
const newerFirst = (a: VersionRow, b: VersionRow): number =>
  b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** The bucket an automatic version is thinned in; null while every one is kept. */
function bucketOf(version: VersionRow, now: number): string | null {
  const age = now - version.createdAt;
  if (age < KEEP_ALL_MS) return null;
  if (age < KEEP_HOURLY_MS)
    return `hour:${Math.floor(version.createdAt / HOUR_MS)}`;
  return `day:${Math.floor(version.createdAt / KEEP_ALL_MS)}`;
}

/**
 * Which of a document's versions stay at `now` and which go, each in the order of `rows`. A removed
 * version maps to the next newer kept one, whose summary its own joins. Ties in time go by id.
 */
export function thinVersions(
  rows: readonly VersionRow[],
  now: number,
): { keep: string[]; remove: string[]; mergeInto: Map<string, string> } {
  const sorted = rows.toSorted(newerFirst);
  const newest = new Set<string>();
  const removed = new Set<string>();
  for (const version of sorted) {
    const bucket = KEPT_KINDS.has(version.kind) ? null : bucketOf(version, now);
    if (bucket === null) continue;
    if (newest.has(bucket)) removed.add(version.id);
    else newest.add(bucket);
  }
  // the newest of a bucket is kept, so every removed version has a newer kept one
  const mergeInto = new Map<string, string>();
  let newer = "";
  for (const { id } of sorted)
    if (removed.has(id)) mergeInto.set(id, newer);
    else newer = id;
  const ids = rows.map((version) => version.id);
  return {
    keep: ids.filter((id) => !removed.has(id)),
    remove: ids.filter((id) => removed.has(id)),
    mergeInto,
  };
}
