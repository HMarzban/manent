// A production cache in memory, holding a copy of what it is given, as a browser's store does.
import type { CachedProduction, ProductionCache } from "../production/cache.ts";

export function createMemoryProductionCache(): ProductionCache {
  const entries = new Map<string, CachedProduction>();
  return {
    read: async (docId) => {
      const held = entries.get(docId);
      return held === undefined ? null : structuredClone(held);
    },
    write: async (docId, value) => {
      entries.set(docId, structuredClone(value));
    },
    clear: async (docId) => {
      entries.delete(docId);
    },
  };
}
