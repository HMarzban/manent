// A home's checkpoints and measures, in a file of their own beside its document file, so writing one never holds the log's writer.
import type { Database } from "bun:sqlite";
import { sha256 } from "../checksum.ts";
import type { Checkpoints, Measures } from "../ports.ts";
import { CHECKPOINTS_KEPT } from "../ports.ts";
import { migrate, openDatabase, transact } from "./files.ts";
import { createSqliteMeasures } from "./measures.ts";

/** The checkpoints file's repositories, which the storage closes when it closes. */
interface CheckpointsFile {
  readonly checkpoints: Checkpoints;
  readonly measures: Measures;
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
    newestFirst: db.query<StoredCheckpoint, [string, number, number]>(
      "SELECT seq, state, sha256 AS sha FROM doc_checkpoints WHERE doc_id = ?1 AND generation = ?2 AND seq <= ?3 ORDER BY seq DESC",
    ),
    drop: db.query<never, [string, number, number]>(
      "DELETE FROM doc_checkpoints WHERE doc_id = ?1 AND generation = ?2 AND seq = ?3",
    ),
  };
}

function createCheckpoints(
  open: () => Database,
  now: () => number,
): Checkpoints {
  let prepared: ReturnType<typeof prepare> | null = null;
  const sql = () => (prepared ??= prepare(open()));
  const checkpoints: Checkpoints = {
    put(docId, generation, seq, state) {
      transact(open(), () => {
        sql().put.run(docId, generation, seq, state, sha256(state), now());
        sql().trim.run(docId, generation, CHECKPOINTS_KEPT);
      });
    },
    newest: (docId, generation) =>
      checkpoints.atOrBefore(docId, generation, Number.MAX_SAFE_INTEGER),
    atOrBefore(docId, generation, atMost) {
      for (const { seq, state, sha } of sql().newestFirst.all(
        docId,
        generation,
        atMost,
      )) {
        if (sha256(state).toHex() === sha.toHex()) return { seq, state };
        transact(open(), () => sql().drop.run(docId, generation, seq));
      }
      return null;
    },
  };
  return checkpoints;
}

/**
 * The checkpoints file at `path`, opened and migrated on first use. StorageError("corrupt")
 * from the first call when SQLite cannot read the file.
 */
export function createCheckpointsFile(options: {
  path: string;
  now: () => number;
}): CheckpointsFile {
  let opened: Database | null = null;
  const open = (): Database => {
    if (opened !== null) return opened;
    const db = openDatabase(options.path);
    try {
      migrate(db, "checkpoints");
    } catch (error) {
      db.close();
      throw error;
    }
    opened = db;
    return db;
  };
  return {
    checkpoints: createCheckpoints(open, options.now),
    measures: createSqliteMeasures(open),
    close: () => opened?.close(),
  };
}
