// The answers of replays already applied, one per document and idempotency key.
import type { Database } from "bun:sqlite";
import type { ReplayRow, Replays } from "../ports.ts";
import { transact } from "./files.ts";

function prepare(db: Database) {
  return {
    put: db.query<
      never,
      [string, string, string, number, number, number, string, number]
    >(
      `INSERT INTO doc_replays (doc_id, replay_key, user_id, from_generation, generation, seq, result, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT (doc_id, replay_key) DO NOTHING`,
    ),
    get: db.query<ReplayRow, [string, string]>(
      `SELECT doc_id AS docId, replay_key AS "key", user_id AS userId, from_generation AS fromGeneration, generation, seq,
       result, created_at AS createdAt FROM doc_replays WHERE doc_id = ?1 AND replay_key = ?2`,
    ),
  };
}

/** The replays of the document file `db`. */
export function createSqliteReplays(db: Database): Replays {
  const sql = prepare(db);
  return {
    get: (docId, key) => sql.get.get(docId, key),
    put(row) {
      const { docId, key, userId, fromGeneration, generation, seq } = row;
      const { result, createdAt } = row;
      transact(db, () => {
        const written = sql.put.run(
          docId,
          key,
          userId,
          fromGeneration,
          generation,
          seq,
          result,
          createdAt,
        );
        if (written.changes === 0)
          throw new RangeError(`replay key ${key} is already stored`);
      });
    },
  };
}
