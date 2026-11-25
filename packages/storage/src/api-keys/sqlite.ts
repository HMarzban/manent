// The public API's keys over SQLite, in the control file.
import type { Database } from "bun:sqlite";
import type { ApiKeyRow, ApiKeyStore } from "../ports/index.ts";
import { transact } from "../sqlite/files.ts";

interface SqlApiKeyRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly key_hash: Uint8Array;
  readonly created_by_user_id: string;
  readonly created_at: number;
  readonly last_used_at: number | null;
  readonly revoked_at: number | null;
}

const toRow = (row: SqlApiKeyRow): ApiKeyRow => ({
  id: row.id,
  workspaceId: row.workspace_id,
  name: row.name,
  keyHash: new Uint8Array(row.key_hash),
  createdByUserId: row.created_by_user_id,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
  revokedAt: row.revoked_at,
});

/** Creates the SQLite ApiKeyStore over the control database. */
export function createSqliteApiKeys(options: {
  db: Database;
  now: () => number;
}): ApiKeyStore {
  const { db, now } = options;
  const insert = db.query<
    null,
    [string, string, string, Uint8Array, string, number]
  >(
    `INSERT INTO api_keys (id, workspace_id, name, key_hash, created_by_user_id, created_at, last_used_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
  );
  const byHash = db.query<SqlApiKeyRow, [Uint8Array]>(
    `SELECT id, workspace_id, name, key_hash, created_by_user_id, created_at, last_used_at, revoked_at
     FROM api_keys WHERE key_hash = ?`,
  );
  const byWorkspace = db.query<SqlApiKeyRow, [string]>(
    `SELECT id, workspace_id, name, key_hash, created_by_user_id, created_at, last_used_at, revoked_at
     FROM api_keys WHERE workspace_id = ?
     ORDER BY created_at DESC, id ASC`,
  );
  const revokeRow = db.query<null, [number, string, string]>(
    `UPDATE api_keys SET revoked_at = ? WHERE id = ? AND workspace_id = ? AND revoked_at IS NULL`,
  );
  const touchRow = db.query<null, [number, string]>(
    `UPDATE api_keys SET last_used_at = ? WHERE id = ?`,
  );

  return {
    create(input): ApiKeyRow {
      const createdAt = now();
      const hashCopy = new Uint8Array(input.keyHash);
      transact(db, () => {
        insert.run(
          input.id,
          input.workspaceId,
          input.name,
          hashCopy,
          input.createdByUserId,
          createdAt,
        );
      });
      return {
        id: input.id,
        workspaceId: input.workspaceId,
        name: input.name,
        keyHash: new Uint8Array(hashCopy),
        createdByUserId: input.createdByUserId,
        createdAt,
        lastUsedAt: null,
        revokedAt: null,
      };
    },
    findByHash(keyHash): ApiKeyRow | null {
      const row = byHash.get(new Uint8Array(keyHash));
      return row === null ? null : toRow(row);
    },
    list(workspaceId): ApiKeyRow[] {
      return byWorkspace.all(workspaceId).map(toRow);
    },
    revoke(workspaceId, id): boolean {
      return transact(
        db,
        () => revokeRow.run(now(), id, workspaceId).changes > 0,
      );
    },
    touch(id): void {
      transact(db, () => {
        touchRow.run(now(), id);
      });
    },
  };
}
