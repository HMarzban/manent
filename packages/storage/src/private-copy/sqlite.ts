// Private copies and their hand-ins over SQLite.
import type { Database } from "bun:sqlite";
import type {
  HandInRow,
  PrivateCopyRow,
  PrivateCopyStore,
} from "../ports/index.ts";
import { transact } from "../sqlite/files.ts";

// the row as a type alias, which SQLite's named bindings accept where an interface lacks the index signature
type Bindings<T> = { [K in keyof T]: T[K] };

const COPY_COLUMNS = `private_doc_id AS privateDocId, source_doc_id AS sourceDocId, owner_user_id AS ownerUserId,
  base_generation AS baseGeneration, base_seq AS baseSeq, base_json AS baseJson, created_at AS createdAt,
  handed_in_at AS handedInAt`;

function prepare(db: Database) {
  return {
    copy: db.query<PrivateCopyRow, [string]>(
      `SELECT ${COPY_COLUMNS} FROM private_copies WHERE private_doc_id = ?1`,
    ),
    // open first; then the latest hand-in, a tie broken by the greater id
    latest: db.query<PrivateCopyRow, [string, string]>(
      `SELECT ${COPY_COLUMNS} FROM private_copies WHERE source_doc_id = ?1 AND owner_user_id = ?2
       ORDER BY handed_in_at IS NOT NULL, handed_in_at DESC, private_doc_id DESC LIMIT 1`,
    ),
    // a stored id, or a second open copy of one source for one owner, inserts nothing
    addCopy: db.query<never, Bindings<PrivateCopyRow>>(
      `INSERT INTO private_copies (private_doc_id, source_doc_id, owner_user_id, base_generation, base_seq, base_json,
       created_at, handed_in_at) VALUES ($privateDocId, $sourceDocId, $ownerUserId, $baseGeneration, $baseSeq, $baseJson,
       $createdAt, $handedInAt) ON CONFLICT DO NOTHING`,
    ),
    markHandedIn: db.query<never, [string, number]>(
      "UPDATE private_copies SET handed_in_at = ?2 WHERE private_doc_id = ?1 AND handed_in_at IS NULL",
    ),
    handIn: db.query<HandInRow, [string]>(
      `SELECT "key", private_doc_id AS privateDocId, user_id AS userId, before_version_id AS beforeVersionId, answer, at
       FROM handins WHERE "key" = ?1`,
    ),
    addHandIn: db.query<never, Bindings<HandInRow>>(
      `INSERT INTO handins ("key", private_doc_id, user_id, before_version_id, answer, at)
       VALUES ($key, $privateDocId, $userId, $beforeVersionId, $answer, $at) ON CONFLICT ("key") DO NOTHING`,
    ),
  };
}

/** The store over a document file's connection, so that its writes join the file's `transaction`. */
export function createSqlitePrivateCopies(db: Database): PrivateCopyStore {
  const sql = prepare(db);
  return {
    copyOf: (privateDocId) => sql.copy.get(privateDocId),
    latestCopyOf: (sourceDocId, ownerUserId) =>
      sql.latest.get(sourceDocId, ownerUserId),
    addCopy: (row) =>
      transact(db, () => {
        if (sql.addCopy.run(row).changes > 0) return;
        if (sql.copy.get(row.privateDocId) !== null)
          throw new RangeError(
            `private copy ${row.privateDocId} is already stored`,
          );
        throw new RangeError(
          `${row.ownerUserId} already has an open private copy of ${row.sourceDocId}`,
        );
      }),
    markHandedIn: (privateDocId, at) =>
      transact(db, () => {
        if (sql.markHandedIn.run(privateDocId, at).changes === 0)
          throw new RangeError(`private copy ${privateDocId} is not open`);
      }),
    handInOf: (key) => sql.handIn.get(key),
    addHandIn: (row) =>
      transact(db, () => {
        if (sql.addHandIn.run(row).changes === 0)
          throw new RangeError(`hand-in key ${row.key} is already stored`);
      }),
  };
}
