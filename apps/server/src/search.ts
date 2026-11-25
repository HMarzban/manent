// Search authority: derived FTS5 index beside control.sqlite, session-end & catch-up indexer, and GET /api/search.
import { createSearchService } from "@manent/server-core";
import { openSqliteSearchIndex } from "@manent/storage";
import type { ServerService } from "./services.ts";

const CATCH_UP_DEBOUNCE_MS = 2_000;

export const searchService: ServerService = {
  create({ storage, sync, clock, dataDir, searchEnabled }) {
    if (searchEnabled === false) return { hooks: [], config: {} };
    const searchIndex = openSqliteSearchIndex(
      dataDir === undefined ? { path: ":memory:" } : { dir: dataDir },
    );
    const search = createSearchService({
      storage,
      sync,
      clock,
      searchIndex,
      scheduleCatchUp: true,
      catchUpDebounceMs: CATCH_UP_DEBOUNCE_MS,
    });
    return {
      hooks: [search.hooks],
      config: { search },
    };
  },
};
