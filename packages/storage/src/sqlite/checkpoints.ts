// A home's checkpoints and measures, in a file of their own beside its document file, so writing one never holds the log's writer.
import type { Database } from "bun:sqlite";
import { sha256 } from "../checksum.ts";
import type { Checkpoints, Measures } from "../ports/index.ts";
import { CHECKPOINTS_KEPT } from "../ports/index.ts";
import { migrate, openDatabase, transact } from "./files.ts";
import type { SqliteDurability } from "./files.ts";
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
    // a pin keeps the newest checkpoint at or before its seq; a pin with none keeps nothing, and NULL never reaches NOT IN
    trim: db.query<never, [string, number, number]>(
      `DELETE FROM doc_checkpoints WHERE doc_id = ?1 AND generation = ?2 AND seq NOT IN
       (SELECT seq FROM doc_checkpoints WHERE doc_id = ?1 AND generation = ?2 ORDER BY seq DESC LIMIT ?3)
       AND seq NOT IN (SELECT kept FROM (SELECT (SELECT max(c.seq) FROM doc_checkpoints c
         WHERE c.doc_id = ?1 AND c.generation = ?2 AND c.seq <= p.seq) AS kept
         FROM checkpoint_pins p WHERE p.doc_id = ?1 AND p.generation = ?2) WHERE kept IS NOT NULL)`,
    ),
    pin: db.query<never, [string, string, number, number]>(
      `INSERT INTO checkpoint_pins (version_id, doc_id, generation, seq) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (version_id) DO UPDATE SET doc_id = excluded.doc_id, generation = excluded.generation, seq = excluded.seq`,
    ),
    unpin: db.query<never, [string]>(
      "DELETE FROM checkpoint_pins WHERE version_id = ?1",
    ),
    purgeCheckpoints: db.query<never, [string, number]>(
      "DELETE FROM doc_checkpoints WHERE doc_id = ?1 AND generation = ?2",
    ),
    purgePins: db.query<never, [string, number]>(
      "DELETE FROM checkpoint_pins WHERE doc_id = ?1 AND generation = ?2",
    ),
    newestOne: db.query<StoredCheckpoint, [string, number, number]>(
      "SELECT seq, state, sha256 AS sha FROM doc_checkpoints WHERE doc_id = ?1 AND generation = ?2 AND seq <= ?3 ORDER BY seq DESC LIMIT 1",
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
      let bound = atMost;
      for (;;) {
        const row = sql().newestOne.get(docId, generation, bound);
        if (row === null) return null;
        if (sha256(row.state).toHex() === row.sha.toHex())
          return { seq: row.seq, state: row.state };
        transact(open(), () => sql().drop.run(docId, generation, row.seq));
        bound = row.seq - 1;
      }
    },
    pin(versionId, docId, generation, seq) {
      transact(open(), () => sql().pin.run(versionId, docId, generation, seq));
    },
    unpin(versionIds) {
      transact(open(), () => {
        for (const versionId of versionIds) sql().unpin.run(versionId);
      });
    },
    purge(docId, generation) {
      transact(open(), () => {
        sql().purgeCheckpoints.run(docId, generation);
        sql().purgePins.run(docId, generation);
      });
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
  durability?: SqliteDurability;
}): CheckpointsFile {
  let opened: Database | null = null;
  // Checkpoints are rebuildable caches, so they never force fullfsync.
  const durability: SqliteDurability =
    options.durability === "off" ? "off" : "normal";
  const open = (): Database => {
    if (opened !== null) return opened;
    const db = openDatabase(options.path, { durability });
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
