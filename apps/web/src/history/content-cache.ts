// The versions this tab has opened, kept in memory so that opening one again fetches nothing.
import type { VersionContent } from "@manent/sync-protocol";

export const CONTENT_CACHE_ENTRIES = 8;
/** Of the versions' JSON text, as it came. */
export const CONTENT_CACHE_BYTES = 64_000_000;

export interface ContentCache {
  /** Null when the version is not kept; a version read becomes the newest used. */
  get(key: string): VersionContent | null;
  has(key: string): boolean;
  /** Keeps `content`, whose JSON text is `bytes` long, dropping the oldest used until both limits hold; one larger than the whole budget is not kept. */
  put(key: string, content: VersionContent, bytes: number): void;
}

export function createContentCache(): ContentCache {
  // a Map keeps insertion order: the first entry is the oldest used
  const kept = new Map<string, { content: VersionContent; bytes: number }>();
  let total = 0;
  const drop = (key: string): void => {
    total -= kept.get(key)?.bytes ?? 0;
    kept.delete(key);
  };
  return {
    get(key) {
      const entry = kept.get(key);
      if (entry === undefined) return null;
      kept.delete(key);
      kept.set(key, entry);
      return entry.content;
    },
    has: (key) => kept.has(key),
    put(key, content, bytes) {
      drop(key);
      if (bytes > CONTENT_CACHE_BYTES) return;
      for (const oldest of kept.keys()) {
        if (
          kept.size < CONTENT_CACHE_ENTRIES &&
          total + bytes <= CONTENT_CACHE_BYTES
        )
          break;
        drop(oldest);
      }
      kept.set(key, { content, bytes });
      total += bytes;
    },
  };
}
