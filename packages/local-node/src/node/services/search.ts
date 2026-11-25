// Offline full-text search for the desktop local node: indexes both authority and relayed documents locally.
import { createSearchService } from "@manent/server-core";
import type { SearchService, SyncHooks } from "@manent/server-core";
import { openSqliteSearchIndex } from "@manent/storage";
import type { SearchIndex } from "@manent/storage";
import type { NodeService } from "../services.ts";

const CATCH_UP_DEBOUNCE_MS = 2_000;

export const searchService: NodeService = {
  create({ storage, sync, clock, searchDir }) {
    const searchIndex = openSqliteSearchIndex(
      searchDir === undefined ? { path: ":memory:" } : { dir: searchDir },
    );
    // Recreating the inner SearchService on catchUpNow (reseed wipe) clears stale metadata caches without closing searchIndex.
    const sharedIndex: SearchIndex = {
      put: (entry) => searchIndex.put(entry),
      remove: (docId) => searchIndex.remove(docId),
      headOf: (docId) => searchIndex.headOf(docId),
      indexedDocIds: () => searchIndex.indexedDocIds(),
      query: (query) => searchIndex.query(query),
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
        searchIndex.close();
      },
    };

    return {
      hooks: [],
      allRoomHooks: [hooks],
      config: { search },
    };
  },
};
