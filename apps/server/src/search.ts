// Search authority: derived FTS5 index beside control.sqlite, session-end & catch-up indexer, and GET /api/search.
import { createSearchService } from "@manent/server-core";
import { openSqliteSearchIndex } from "@manent/storage";
import type { ServerService } from "./services.ts";

export const searchService: ServerService = {
  create({ storage, sync, clock, dataDir }) {
    const searchIndex = openSqliteSearchIndex(
      dataDir === undefined ? { path: ":memory:" } : { dir: dataDir },
    );
    const search = createSearchService({
      storage,
      sync,
      clock,
      searchIndex,
      scheduleCatchUp: true,
    });
    return {
      hooks: [search.hooks],
      config: { search },
    };
  },
};
