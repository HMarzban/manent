// What the history service learns from production: the anchor table at a version's position, and the
// number a scene that comes back takes.
import type { HistoryExtras } from "../history/service.ts";
import { recordsOf } from "./state.ts";

export const PRODUCTION_EXTRAS: HistoryExtras = Object.freeze<HistoryExtras>({
  locksAt(file, docId, at) {
    const rows = file.production.anchorsAt(docId, at);
    return rows.length === 0 ? null : recordsOf(rows);
  },
  authority(file, docId) {
    const issued = new Map(
      file.production.sceneNumbers(docId).map((n) => [n.blockId, n.num]),
    );
    return (blockId) => {
      const num = issued.get(blockId);
      return num === undefined ? null : { num, omitted: false };
    };
  },
});
