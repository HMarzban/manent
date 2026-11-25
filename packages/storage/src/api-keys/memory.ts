// The public API's keys kept in memory, for the in-memory driver.
import { StorageError } from "../ports/index.ts";
import type { ApiKeyRow, ApiKeyStore } from "../ports/index.ts";

/** The control file's rows. Values are replaced, never changed in place. */
export interface ApiKeyTables {
  readonly rows: Map<string, ApiKeyRow>;
  readonly byHash: Map<string, string>;
}

/** Creates empty in-memory tables for ApiKeyStore. */
export function createApiKeyTables(): ApiKeyTables {
  return { rows: new Map(), byHash: new Map() };
}

const hexOf = (bytes: Uint8Array): string => {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
};

const copyRow = (row: ApiKeyRow): ApiKeyRow => ({
  ...row,
  keyHash: new Uint8Array(row.keyHash),
});

const compareKeys = (a: ApiKeyRow, b: ApiKeyRow): number =>
  b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The store over the storage's tables; `commit` writes through whatever fault is armed. */
export function createMemoryApiKeys(options: {
  now: () => number;
  read: () => ApiKeyTables;
  commit: <T>(apply: () => T) => T;
}): ApiKeyStore {
  const { now, read, commit } = options;
  return {
    create(input): ApiKeyRow {
      const hashCopy = new Uint8Array(input.keyHash);
      const hashKey = hexOf(hashCopy);
      return commit(() => {
        const tables = read();
        if (tables.rows.has(input.id) || tables.byHash.has(hashKey)) {
          throw new StorageError("commit_failed");
        }
        const row: ApiKeyRow = {
          id: input.id,
          workspaceId: input.workspaceId,
          name: input.name,
          keyHash: hashCopy,
          createdByUserId: input.createdByUserId,
          createdAt: now(),
          lastUsedAt: null,
          revokedAt: null,
        };
        tables.rows.set(row.id, row);
        tables.byHash.set(hashKey, row.id);
        return copyRow(row);
      });
    },
    findByHash(keyHash): ApiKeyRow | null {
      const tables = read();
      const id = tables.byHash.get(hexOf(keyHash));
      if (id === undefined) return null;
      const row = tables.rows.get(id);
      return row === undefined ? null : copyRow(row);
    },
    list(workspaceId): ApiKeyRow[] {
      return [...read().rows.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .toSorted(compareKeys)
        .map(copyRow);
    },
    revoke(workspaceId, id): boolean {
      return commit(() => {
        const tables = read();
        const row = tables.rows.get(id);
        if (
          row === undefined ||
          row.workspaceId !== workspaceId ||
          row.revokedAt !== null
        ) {
          return false;
        }
        tables.rows.set(id, { ...row, revokedAt: now() });
        return true;
      });
    },
    touch(id): void {
      commit(() => {
        const tables = read();
        const row = tables.rows.get(id);
        if (row === undefined) return;
        tables.rows.set(id, { ...row, lastUsedAt: now() });
      });
    },
  };
}
