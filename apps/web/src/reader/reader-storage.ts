// Browser storage for anonymous reader last-read state, pending tap-to-comment and bounded offline draft copies.
import type { DraftOpenResponse } from "@manent/sync-protocol";
import type { TabStorage } from "../session.ts";
import { isDraftOpenResponse } from "./reader-requests.ts";

/** Local storage key holding a JSON map of `docId -> versionId` for anonymous readers. */
export const READER_LAST_READ_KEY = "manent.reader.lastRead";

const READER_CACHE_KEY = "manent.reader.cache";
const PENDING_TAP_PREFIX = "manent.reader.pendingTap.";
const MAX_CACHED_DRAFTS = 8;

export interface PendingReaderTap {
  readonly blockId: string;
  readonly place: { readonly left: number; readonly top: number };
}

export interface CachedDraft {
  readonly userId: string | null;
  readonly openedAt: number;
  readonly draft: DraftOpenResponse;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // malformed storage data is ignored safely
    return null;
  }
}

function readLastReadMap(storage: Storage | null): Record<string, string> {
  if (storage === null) return {};
  let raw: string | null;
  try {
    raw = storage.getItem(READER_LAST_READ_KEY);
  } catch {
    // storage refused by the browser
    return {};
  }
  const parsed = parseJson(raw);
  if (!isRecord(parsed)) return {};
  const map: Record<string, string> = {};
  for (const [docId, versionId] of Object.entries(parsed)) {
    if (typeof versionId === "string" && versionId !== "")
      map[docId] = versionId;
  }
  return map;
}

/** Earlier version an anonymous reader last read on `docId`; null when none is stored. */
export function readAnonLastRead(
  storage: Storage | null,
  docId: string,
): string | null {
  return readLastReadMap(storage)[docId] ?? null;
}

/** Records `versionId` as the last draft an anonymous reader opened for `docId`. */
export function writeAnonLastRead(
  storage: Storage | null,
  docId: string,
  versionId: string,
): void {
  if (storage === null) return;
  const map = readLastReadMap(storage);
  map[docId] = versionId;
  try {
    storage.setItem(READER_LAST_READ_KEY, JSON.stringify(map));
  } catch {
    // storage quota or browser refusal leaves the in-memory view intact
  }
}

function isCachedDraft(value: unknown): value is CachedDraft {
  return (
    isRecord(value) &&
    (value.userId === null || typeof value.userId === "string") &&
    typeof value.openedAt === "number" &&
    Number.isSafeInteger(value.openedAt) &&
    isDraftOpenResponse(value.draft)
  );
}

function readCacheMap(storage: Storage | null): Record<string, CachedDraft> {
  if (storage === null) return {};
  let raw: string | null;
  try {
    raw = storage.getItem(READER_CACHE_KEY);
  } catch {
    // storage refused by the browser
    return {};
  }
  const parsed = parseJson(raw);
  if (!isRecord(parsed)) return {};
  const entries: Record<string, CachedDraft> = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (isCachedDraft(entry)) entries[key] = entry;
  }
  return entries;
}

const cacheKey = (token: string, userId: string | null): string =>
  `${userId === null ? "anon" : `user:${userId}`}:${token}`;

/**
 * The cached copy of `token` opened by `userId` (null for anonymous); null when none exists
 * or when cached for a different reader, so watermarked or signed-in drafts never leak across readers.
 */
export function readCachedDraft(
  storage: Storage | null,
  token: string,
  userId: string | null,
): CachedDraft | null {
  const map = readCacheMap(storage);
  const entry = map[cacheKey(token, userId)] ?? map[token];
  if (entry === undefined || entry.userId !== userId) return null;
  return entry;
}

/** Stores a bounded offline copy of `draft` scoped to `(userId, token)`. */
export function writeCachedDraft(
  storage: Storage | null,
  token: string,
  userId: string | null,
  openedAt: number,
  draft: DraftOpenResponse,
): void {
  if (storage === null) return;
  const map = readCacheMap(storage);
  const key = cacheKey(token, userId);
  if (map[token]?.userId === userId) delete map[token];
  map[key] = { userId, openedAt, draft };
  const keys = Object.keys(map);
  if (keys.length > MAX_CACHED_DRAFTS) {
    const oldest = keys.toSorted(
      (a, b) => (map[a]?.openedAt ?? 0) - (map[b]?.openedAt ?? 0),
    );
    for (const oldKey of oldest.slice(0, keys.length - MAX_CACHED_DRAFTS)) {
      delete map[oldKey];
    }
  }
  try {
    storage.setItem(READER_CACHE_KEY, JSON.stringify(map));
  } catch {
    // storage quota or refusal leaves online reading unaffected
  }
}

/** Evicts any cached offline copy of `token` for `userId` (for example after an online refusal). */
export function removeCachedDraft(
  storage: Storage | null,
  token: string,
  userId: string | null,
): void {
  if (storage === null) return;
  const map = readCacheMap(storage);
  const key = cacheKey(token, userId);
  let changed = false;
  if (key in map) {
    delete map[key];
    changed = true;
  }
  if (map[token]?.userId === userId) {
    delete map[token];
    changed = true;
  }
  if (!changed) return;
  try {
    storage.setItem(READER_CACHE_KEY, JSON.stringify(map));
  } catch {
    // storage refusal leaves in-memory state unaffected
  }
}

function isPendingTap(value: unknown): value is PendingReaderTap {
  if (!isRecord(value) || typeof value.blockId !== "string") return false;
  if (!isRecord(value.place)) return false;
  return (
    typeof value.place.left === "number" &&
    Number.isFinite(value.place.left) &&
    typeof value.place.top === "number" &&
    Number.isFinite(value.place.top)
  );
}

/** Reads a pending tap-to-comment target persisted across anonymous→signed-in remount. */
export function readPendingTap(
  storage: TabStorage | null,
  token: string,
): PendingReaderTap | null {
  if (storage === null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(`${PENDING_TAP_PREFIX}${token}`);
  } catch {
    return null;
  }
  const parsed = parseJson(raw);
  return isPendingTap(parsed) ? parsed : null;
}

/** Persists a pending tap-to-comment target for `token` in tab session storage. */
export function writePendingTap(
  storage: TabStorage | null,
  token: string,
  tap: PendingReaderTap,
): void {
  if (storage === null) return;
  try {
    storage.setItem(`${PENDING_TAP_PREFIX}${token}`, JSON.stringify(tap));
  } catch {
    // storage refusal falls back to current mount only
  }
}

/** Clears any persisted pending tap-to-comment target for `token`. */
export function clearPendingTap(
  storage: TabStorage | null,
  token: string,
): void {
  if (storage === null) return;
  try {
    storage.removeItem(`${PENDING_TAP_PREFIX}${token}`);
  } catch {
    // storage refusal leaves in-memory state unaffected
  }
}
