// Offline full-text search for the desktop local node: indexes both authority and relayed documents locally.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createSearchService } from "@manent/server-core";
import type { SearchService, SyncHooks } from "@manent/server-core";
import { SEARCH_INDEX_FILE, openSqliteSearchIndex } from "@manent/storage";
import type { SearchIndex } from "@manent/storage";
import type { NodeService } from "../services.ts";

const CATCH_UP_DEBOUNCE_MS = 2_000;

export const searchService: NodeService = {
  create({ storage, sync, clock, searchDir }) {
    let index: SearchIndex | null = null;
    const ensureOpen = (): SearchIndex => {
      if (index !== null) return index;
      index = openSqliteSearchIndex(
        searchDir === undefined ? { path: ":memory:" } : { dir: searchDir },
      );
      return index;
    };
    const openIfExists = (): SearchIndex | null => {
      if (index !== null) return index;
      if (
        searchDir !== undefined &&
        existsSync(join(searchDir, SEARCH_INDEX_FILE))
      )
        return ensureOpen();
      return null;
    };
    // Recreating the inner SearchService on catchUpNow (reseed wipe) clears stale metadata caches without closing searchIndex.
    // Opening search.sqlite lazily keeps idle cold boots with no scripts from allocating an empty FTS5 database.
    const sharedIndex: SearchIndex = {
      put: (entry) => ensureOpen().put(entry),
      remove: (docId) => openIfExists()?.remove(docId),
      headOf: (docId) => openIfExists()?.headOf(docId) ?? null,
      indexedDocIds: () => openIfExists()?.indexedDocIds() ?? [],
      query: (query) => ensureOpen().query(query),
      close() {},
    };
    const makeInner = (): SearchService =>
      createSearchService({
        storage,
        sync,
        clock,
        searchIndex: sharedIndex,
        scheduleCatchUp: true,
        catchUpDebounceMs: CATCH_UP_DEBOUNCE_MS,
      });

    let inner = makeInner();
    let stopped = false;

    const hooks: SyncHooks = {
      committed(committed) {
        inner.hooks.committed?.(committed);
      },
      editorLeft(room, userId) {
        inner.hooks.editorLeft?.(room, userId);
      },
      forgotten(room) {
        inner.hooks.forgotten?.(room);
      },
    };

    const search: SearchService = {
      hooks,
      search: (userId, request) => inner.search(userId, request),
      catchUpNow() {
        if (stopped) return;
        inner.stop();
        inner = makeInner();
        inner.catchUpNow();
      },
      stop() {
        if (stopped) return;
        stopped = true;
        inner.stop();
        index?.close();
        index = null;
      },
    };

    return {
      hooks: [],
      allRoomHooks: [hooks],
      config: { search },
    };
  },
};
