// A document file's versions: their rows, pages, snapshots and summaries, the chunks snapshots are cut into,
// the answers of history requests, and the purge of a frozen generation's log.
import type { Database } from "bun:sqlite";
import type {
  History,
  HistoryRequestRow,
  VersionKind,
  VersionRow,
  Versions,
} from "../ports/index.ts";
import { StorageError } from "../ports/index.ts";
import { readStrings } from "./directory.ts";
import { transact } from "./files.ts";

// The closed set a stored kind is checked against; a member added to the union fails typecheck here.
const VERSION_KINDS = {
  auto: true,
  saved: true,
  named: true,
  sent: true,
  export: true,
  device: true,
  pre_restore: true,
  pre_merge: true,
  pre_heal: true,
  recovered: true,
  revision_baseline: true,
  revision_issue: true,
  prompter: true,
  pre_hand_in: true,
} satisfies Record<VersionKind, true>;

type StoredVersion = Omit<VersionRow, "kind"> & { kind: string };

const isVersionKind = (kind: string): kind is VersionKind =>
  Object.hasOwn(VERSION_KINDS, kind);

/** A stored kind outside its closed set is damage, never a value. */
function readVersion(row: StoredVersion): VersionRow {
  const { kind } = row;
  if (isVersionKind(kind)) return { ...row, kind };
  throw new StorageError("corrupt");
}

const VERSION = `SELECT id, doc_id AS docId, generation, seq, kind, name, created_by AS createdByUserId, created_at AS createdAt,
  device_id AS deviceId FROM doc_versions`;

/** The versions of the document file `db`. */
export function createSqliteVersions(db: Database): Versions {
  const add = db.query<
    never,
    [
      string,
      string,
      number | null,
      number | null,
      string,
      string | null,
      string,
      number,
      string | null,
    ]
  >(
    "INSERT INTO doc_versions (id, doc_id, generation, seq, kind, name, created_by, created_at, device_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
  );
  const list = db.query<StoredVersion, [string]>(
    `${VERSION} WHERE doc_id = ?1 ORDER BY created_at DESC, rowid DESC`,
  );
  return {
    add(v) {
      transact(db, () =>
        add.run(
          v.id,
          v.docId,
          v.generation,
          v.seq,
          v.kind,
          v.name,
          v.createdByUserId,
          v.createdAt,
          v.deviceId,
        ),
      );
    },
    list: (docId) => list.all(docId).map(readVersion),
  };
}

interface StoredSummary {
  authorIds: string;
  blockIds: string;
  sceneIds: string;
}

function prepare(db: Database) {
  return {
    first: db.query<StoredVersion, [string, number]>(
      `${VERSION} WHERE doc_id = ?1 ORDER BY created_at DESC, id DESC LIMIT ?2`,
    ),
    after: db.query<StoredVersion, [string, number, string, number]>(
      `${VERSION} WHERE doc_id = ?1 AND (created_at, id) < (?2, ?3) ORDER BY created_at DESC, id DESC LIMIT ?4`,
    ),
    get: db.query<StoredVersion, [string]>(`${VERSION} WHERE id = ?1`),
    snapshotOf: db.query<
      { ref: string; engineVersion: number | null },
      [string]
    >(
      "SELECT snapshot_ref AS ref, engine_version AS engineVersion FROM doc_versions WHERE id = ?1 AND snapshot_ref IS NOT NULL",
    ),
    setSnapshot: db.query<never, [string, string, number | null]>(
      "UPDATE doc_versions SET snapshot_ref = ?2, engine_version = ?3 WHERE id = ?1",
    ),
    removeVersion: db.query<never, [string]>(
      "DELETE FROM doc_versions WHERE id = ?1",
    ),
    removeSummary: db.query<never, [string]>(
      "DELETE FROM version_summaries WHERE version_id = ?1",
    ),
    putChunk: db.query<never, [Uint8Array, Uint8Array]>(
      "INSERT INTO version_chunks (hash, body) VALUES (?1, ?2) ON CONFLICT (hash) DO NOTHING",
    ),
    chunk: db.query<{ body: Uint8Array }, [Uint8Array]>(
      "SELECT body FROM version_chunks WHERE hash = ?1",
    ),
    chunkHashes: db.query<{ hash: Uint8Array }, []>(
      "SELECT hash FROM version_chunks ORDER BY hash",
    ),
    removeChunk: db.query<never, [Uint8Array]>(
      "DELETE FROM version_chunks WHERE hash = ?1",
    ),
    summary: db.query<StoredSummary, [string]>(
      "SELECT author_ids AS authorIds, block_ids AS blockIds, scene_ids AS sceneIds FROM version_summaries WHERE version_id = ?1",
    ),
    setSummary: db.query<never, [string, string, string, string]>(
      `INSERT INTO version_summaries (version_id, author_ids, block_ids, scene_ids) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (version_id) DO UPDATE SET author_ids = excluded.author_ids, block_ids = excluded.block_ids,
       scene_ids = excluded.scene_ids`,
    ),
    request: db.query<HistoryRequestRow, [string, string]>(
      `SELECT doc_id AS docId, request_key AS "key", user_id AS userId, result, created_at AS createdAt
       FROM history_requests WHERE doc_id = ?1 AND request_key = ?2`,
    ),
    putRequest: db.query<never, [string, string, string, string, number]>(
      `INSERT INTO history_requests (doc_id, request_key, user_id, result, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (doc_id, request_key) DO NOTHING`,
    ),
    generation: db.query<{ generation: number }, [string]>(
      "SELECT generation FROM documents WHERE id = ?1",
    ),
    purgeUpdates: db.query<never, [string, number]>(
      "DELETE FROM doc_updates WHERE doc_id = ?1 AND generation = ?2",
    ),
    purgeFinalState: db.query<never, [string, number]>(
      "UPDATE doc_generations SET final_state = NULL WHERE doc_id = ?1 AND generation = ?2",
    ),
  };
}

/** The history of the document file `db`. */
export function createSqliteHistory(db: Database): History {
  const sql = prepare(db);
  return {
    page: (docId, before, limit) =>
      (before === null
        ? sql.first.all(docId, limit)
        : sql.after.all(docId, before.createdAt, before.id, limit)
      ).map(readVersion),
    get(versionId) {
      const row = sql.get.get(versionId);
      return row === null ? null : readVersion(row);
    },
    snapshotOf: (versionId) => sql.snapshotOf.get(versionId),
    setSnapshot(versionId, ref, engineVersion) {
      transact(db, () => sql.setSnapshot.run(versionId, ref, engineVersion));
    },
    remove(versionIds) {
      transact(db, () => {
        for (const id of versionIds) {
          sql.removeVersion.run(id);
          sql.removeSummary.run(id);
        }
      });
    },
    putChunk(hash, body) {
      transact(db, () => sql.putChunk.run(hash, body));
    },
    chunk: (hash) => sql.chunk.get(hash)?.body ?? null,
    chunkHashes: () => sql.chunkHashes.all().map((row) => row.hash),
    removeChunks(hashes) {
      transact(db, () => {
        for (const hash of hashes) sql.removeChunk.run(hash);
      });
    },
    summary(versionId) {
      const row = sql.summary.get(versionId);
      if (row === null) return null;
      return {
        authorIds: readStrings(row.authorIds),
        blockIds: readStrings(row.blockIds),
        sceneIds: readStrings(row.sceneIds),
      };
    },
    setSummary(versionId, summary) {
      const { authorIds, blockIds, sceneIds } = summary;
      transact(db, () =>
        sql.setSummary.run(
          versionId,
          JSON.stringify(authorIds),
          JSON.stringify(blockIds),
          JSON.stringify(sceneIds),
        ),
      );
    },
    request: (docId, key) => sql.request.get(docId, key),
    putRequest(row) {
      const { docId, key, userId, result, createdAt } = row;
      transact(db, () => {
        const written = sql.putRequest.run(
          docId,
          key,
          userId,
          result,
          createdAt,
        );
        if (written.changes === 0)
          throw new RangeError(`history request key ${key} is already stored`);
      });
    },
    purgeLog: (docId, generation) =>
      transact(db, () => {
        const current = sql.generation.get(docId)?.generation ?? null;
        if (current === null || generation >= current)
          throw new RangeError(
            `generation ${generation} of ${docId} is not frozen`,
          );
        const removed = sql.purgeUpdates.run(docId, generation).changes;
        sql.purgeFinalState.run(docId, generation);
        return removed;
      }),
  };
}
