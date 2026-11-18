// What the checkpoint job measured of each document's generation, kept beside the checkpoints.
import type { Database } from "bun:sqlite";
import type { MeasureRow, Measures } from "../ports.ts";
import { transact } from "./files.ts";

function prepare(db: Database) {
  return {
    put: db.query<
      never,
      [string, number, number, number, number, number, number]
    >(
      `INSERT INTO doc_measures (doc_id, generation, seq, live_bytes, plain_bytes, client_ids, largest_section)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (doc_id, generation) DO UPDATE SET seq = excluded.seq, live_bytes = excluded.live_bytes,
       plain_bytes = excluded.plain_bytes, client_ids = excluded.client_ids, largest_section = excluded.largest_section`,
    ),
    get: db.query<MeasureRow, [string, number]>(
      `SELECT seq, live_bytes AS liveBytes, plain_bytes AS plainBytes, client_ids AS clientIds, largest_section AS largestSection
       FROM doc_measures WHERE doc_id = ?1 AND generation = ?2`,
    ),
  };
}

/** The measures in the checkpoints file that `open` opens on first use. */
export function createSqliteMeasures(open: () => Database): Measures {
  let prepared: ReturnType<typeof prepare> | null = null;
  const sql = () => (prepared ??= prepare(open()));
  return {
    put(docId, generation, row) {
      const { seq, liveBytes, plainBytes, clientIds, largestSection } = row;
      transact(open(), () =>
        sql().put.run(
          docId,
          generation,
          seq,
          liveBytes,
          plainBytes,
          clientIds,
          largestSection,
        ),
      );
    },
    get: (docId, generation) => sql().get.get(docId, generation),
  };
}
