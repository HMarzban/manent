// A document's closed generations, and the one write that closes the current one.
import type { Database } from "bun:sqlite";
import type { DocLog, Generations, GenerationRow } from "../ports/index.ts";
import { transact } from "./files.ts";

const GENERATION = `SELECT doc_id AS docId, generation, final_seq AS finalSeq, final_state AS finalState, frozen_at AS frozenAt,
  purge_after AS purgeAfter, reason, next_initial_bytes AS nextInitialBytes, rebuilt_by_client_id AS rebuiltByClientId
  FROM doc_generations WHERE doc_id = ?1`;

function prepare(db: Database) {
  return {
    frozen: db.query<
      never,
      [
        string,
        number,
        Uint8Array,
        number,
        number,
        number,
        string,
        number,
        number,
      ]
    >(
      `INSERT INTO doc_generations (doc_id, generation, final_state, final_seq, frozen_at, purge_after, reason,
       next_initial_bytes, rebuilt_by_client_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    ),
    advance: db.query<never, [string, number]>(
      "UPDATE documents SET generation = ?2, head_seq = 0 WHERE id = ?1",
    ),
    unacknowledge: db.query<never, [string]>(
      "UPDATE doc_clients SET acked_clock = 0 WHERE doc_id = ?1",
    ),
    // no doc_people row, so the system takes no colour
    system: db.query<never, [string, number, string, number]>(
      `INSERT INTO doc_clients (doc_id, client_id, user_id, first_seen, acked_clock) VALUES (?1, ?2, ?3, ?4, 0)
       ON CONFLICT (doc_id, client_id) DO NOTHING`,
    ),
    get: db.query<GenerationRow, [string, number]>(
      `${GENERATION} AND generation = ?2`,
    ),
    list: db.query<GenerationRow, [string]>(
      `${GENERATION} ORDER BY generation`,
    ),
  };
}

/** The generations of the document file `db`, whose `log` writes the new generation's first row. */
export function createSqliteGenerations(options: {
  db: Database;
  log: DocLog;
  now: () => number;
}): Generations {
  const { db, log, now } = options;
  const sql = prepare(db);
  return {
    freeze: (item) =>
      transact(db, () => {
        const { docId, finalSeq, initialUpdate, userId } = item;
        const row = log.get(docId);
        if (row === null) throw new RangeError(`no document ${docId}`);
        if (row.headSeq !== finalSeq)
          throw new RangeError(
            `a generation closes at its head ${row.headSeq}, not at ${finalSeq}`,
          );
        sql.frozen.run(
          docId,
          row.generation,
          item.finalState,
          finalSeq,
          item.frozenAt,
          item.purgeAfter,
          item.reason,
          initialUpdate.length,
          item.rebuiltByClientId,
        );
        const generation = row.generation + 1;
        sql.advance.run(docId, generation);
        sql.unacknowledge.run(docId);
        sql.system.run(docId, item.rebuiltByClientId, userId, now());
        const first = { docId, generation, update: initialUpdate, userId };
        log.append({ ...first, origin: "system", clocks: [] });
        return generation;
      }),
    get: (docId, generation) => sql.get.get(docId, generation),
    list: (docId) => sql.list.all(docId),
  };
}
