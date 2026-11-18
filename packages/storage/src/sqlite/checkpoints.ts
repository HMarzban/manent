// A home's checkpoints, in a file of their own beside its document file, so writing one never holds the log's writer.
import type { Database } from "bun:sqlite";
import { sha256 } from "../checksum.ts";
import type { Checkpoints } from "../ports.ts";
import { CHECKPOINTS_KEPT } from "../ports.ts";
import { migrate, openDatabase, transact } from "./files.ts";

/** Checkpoints whose file the storage closes when it closes. */
export interface SqliteCheckpoints extends Checkpoints {
  close(): void;
}

interface StoredCheckpoint {
  seq: number;
  state: Uint8Array;
  sha: Uint8Array;
}

function prepare(db: Database) {
  return {
    put: db.query<
      never,
      [string, number, number, Uint8Array, Uint8Array, number]
    >(
      `INSERT INTO doc_checkpoints (doc_id, generation, seq, state, sha256, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (doc_id, generation, seq) DO UPDATE SET state = excluded.state, sha256 = excluded.sha256, created_at = excluded.created_at`,
    ),
    trim: db.query<never, [string, number, number]>(
      `DELETE FROM doc_checkpoints WHERE doc_id = ?1 AND generation = ?2 AND seq NOT IN
       (SELECT seq FROM doc_checkpoints WHERE doc_id = ?1 AND generation = ?2 ORDER BY seq DESC LIMIT ?3)`,
    ),
    newestFirst: db.query<StoredCheckpoint, [string, number]>(
      "SELECT seq, state, sha256 AS sha FROM doc_checkpoints WHERE doc_id = ?1 AND generation = ?2 ORDER BY seq DESC",
    ),
    drop: db.query<never, [string, number, number]>(
      "DELETE FROM doc_checkpoints WHERE doc_id = ?1 AND generation = ?2 AND seq = ?3",
    ),
  };
}

/**
 * The checkpoints in `path`, opened and migrated on first use. StorageError("corrupt")
 * from the first call when SQLite cannot read the file.
 */
export function createSqliteCheckpoints(options: {
  path: string;
  now: () => number;
}): SqliteCheckpoints {
  let opened: { db: Database; sql: ReturnType<typeof prepare> } | null = null;
  const open = () => {
    if (opened !== null) return opened;
    const db = openDatabase(options.path);
    try {
      migrate(db, "checkpoints");
    } catch (error) {
      db.close();
      throw error;
    }
    opened = { db, sql: prepare(db) };
    return opened;
  };
  return {
    put(docId, generation, seq, state) {
      const { db, sql } = open();
      transact(db, () => {
        sql.put.run(
          docId,
          generation,
          seq,
          state,
          sha256(state),
          options.now(),
        );
        sql.trim.run(docId, generation, CHECKPOINTS_KEPT);
      });
    },
    newest(docId, generation) {
      const { db, sql } = open();
      for (const { seq, state, sha } of sql.newestFirst.all(
        docId,
        generation,
      )) {
        if (sha256(state).toHex() === sha.toHex()) return { seq, state };
        transact(db, () => sql.drop.run(docId, generation, seq));
      }
      return null;
    },
    close: () => opened?.db.close(),
  };
}
