// The documents a device handed over, one row per document, kept with the key it came under.
import type { Database } from "bun:sqlite";
import type { Adoption, Adoptions } from "../ports/index.ts";
import { transact } from "./files.ts";

/** The adoptions of the document file `db`. */
export function createSqliteAdoptions(db: Database): Adoptions {
  const put = db.query<never, [string, string, string, number, number]>(
    `INSERT INTO doc_adoptions (doc_id, key, user_id, seq, adopted_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (doc_id) DO NOTHING`,
  );
  const get = db.query<Adoption, [string]>(
    `SELECT doc_id AS docId, key, user_id AS userId, seq, adopted_at AS adoptedAt FROM doc_adoptions WHERE doc_id = ?1`,
  );
  return {
    get: (docId) => get.get(docId),
    put(adoption) {
      const { docId, key, userId, seq, adoptedAt } = adoption;
      transact(db, () => put.run(docId, key, userId, seq, adoptedAt));
    },
  };
}
