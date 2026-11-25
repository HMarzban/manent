// Project binary asset storage over SQLite and in-memory tables, enforcing the per-project byte cap atomically.
import type { Database } from "bun:sqlite";
import { PROJECT_ASSETS_MAX_BYTES } from "../ports/index.ts";
import type {
  ProjectAssetMeta,
  ProjectAssetRow,
  ProjectAssetsStore,
  PutProjectAsset,
  PutProjectAssetResult,
} from "../ports/index.ts";
import { transact } from "../sqlite/files.ts";

const META_COLUMNS = `asset_id AS assetId, mime, byte_length AS byteLength, width, height,
  created_by_user_id AS createdByUserId, created_at AS createdAt`;

function copyMeta(row: ProjectAssetMeta): ProjectAssetMeta {
  return {
    assetId: row.assetId,
    mime: row.mime,
    byteLength: row.byteLength,
    width: row.width,
    height: row.height,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
  };
}

function copyRow(row: ProjectAssetRow): ProjectAssetRow {
  return {
    ...copyMeta(row),
    bytes: new Uint8Array(row.bytes),
  };
}

function prepare(db: Database) {
  return {
    get: db.query<ProjectAssetRow, [string]>(
      `SELECT ${META_COLUMNS}, bytes FROM project_assets WHERE asset_id = ?1`,
    ),
    head: db.query<ProjectAssetMeta, [string]>(
      `SELECT ${META_COLUMNS} FROM project_assets WHERE asset_id = ?1`,
    ),
    totalBytes: db.query<{ total: number }, []>(
      "SELECT COALESCE(SUM(byte_length), 0) AS total FROM project_assets",
    ),
    listMeta: db.query<ProjectAssetMeta, []>(
      `SELECT ${META_COLUMNS} FROM project_assets ORDER BY created_at ASC, asset_id ASC`,
    ),
    insert: db.query<
      never,
      [string, string, number, number, number, Uint8Array, string, number]
    >(
      `INSERT INTO project_assets (asset_id, mime, byte_length, width, height, bytes, created_by_user_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ),
  };
}

/** The project assets store over a document file's SQLite connection, joining its `transaction`. */
export function createSqliteAssets(db: Database): ProjectAssetsStore {
  const sql = prepare(db);
  return {
    get(assetId) {
      const row = sql.get.get(assetId);
      return row === null ? null : copyRow(row);
    },
    head(assetId) {
      const row = sql.head.get(assetId);
      return row === null ? null : copyMeta(row);
    },
    put(asset: PutProjectAsset): PutProjectAssetResult {
      const maxBytes = asset.maxProjectBytes ?? PROJECT_ASSETS_MAX_BYTES;
      const bytes = new Uint8Array(asset.bytes);
      const byteLength = bytes.byteLength;
      return transact(db, () => {
        const existing = sql.head.get(asset.assetId);
        if (existing !== null)
          return { status: "exists", meta: copyMeta(existing) };
        const usedBytes = sql.totalBytes.get()?.total ?? 0;
        if (usedBytes + byteLength > maxBytes)
          return { status: "quota_exceeded", usedBytes, maxBytes };
        sql.insert.run(
          asset.assetId,
          asset.mime,
          byteLength,
          asset.width,
          asset.height,
          bytes,
          asset.createdByUserId,
          asset.createdAt,
        );
        return {
          status: "stored",
          meta: {
            assetId: asset.assetId,
            mime: asset.mime,
            byteLength,
            width: asset.width,
            height: asset.height,
            createdByUserId: asset.createdByUserId,
            createdAt: asset.createdAt,
          },
        };
      });
    },
    totalBytes: () => sql.totalBytes.get()?.total ?? 0,
    listMeta: () => sql.listMeta.all().map(copyMeta),
  };
}

/** One document file's asset rows kept in memory; entries are replaced, never mutated in place. */
export interface AssetTables {
  rows: Map<string, ProjectAssetRow>;
}

/** A copy a transaction may change without touching `tables`. */
export function copyAssetTables(tables: AssetTables | undefined): AssetTables {
  return {
    rows: new Map(tables?.rows),
  };
}

const byCreatedThenId = (a: ProjectAssetMeta, b: ProjectAssetMeta): number =>
  a.createdAt - b.createdAt ||
  (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0);

function sumAssetBytes(tables: AssetTables): number {
  let total = 0;
  for (const row of tables.rows.values()) total += row.byteLength;
  return total;
}

/** The in-memory project assets store over `read` and `write`. */
export function createMemoryAssets(options: {
  read: () => AssetTables;
  write: <T>(op: (tables: AssetTables) => T) => T;
}): ProjectAssetsStore {
  const { read, write } = options;
  return {
    get(assetId) {
      const row = read().rows.get(assetId);
      return row === undefined ? null : copyRow(row);
    },
    head(assetId) {
      const row = read().rows.get(assetId);
      return row === undefined ? null : copyMeta(row);
    },
    put(asset: PutProjectAsset): PutProjectAssetResult {
      const maxBytes = asset.maxProjectBytes ?? PROJECT_ASSETS_MAX_BYTES;
      const bytes = new Uint8Array(asset.bytes);
      const byteLength = bytes.byteLength;
      return write((tables) => {
        const existing = tables.rows.get(asset.assetId);
        if (existing !== undefined)
          return { status: "exists", meta: copyMeta(existing) };
        const usedBytes = sumAssetBytes(tables);
        if (usedBytes + byteLength > maxBytes)
          return { status: "quota_exceeded", usedBytes, maxBytes };
        const row: ProjectAssetRow = {
          assetId: asset.assetId,
          mime: asset.mime,
          byteLength,
          width: asset.width,
          height: asset.height,
          bytes,
          createdByUserId: asset.createdByUserId,
          createdAt: asset.createdAt,
        };
        tables.rows.set(asset.assetId, row);
        return { status: "stored", meta: copyMeta(row) };
      });
    },
    totalBytes: () => sumAssetBytes(read()),
    listMeta: () =>
      [...read().rows.values()].map(copyMeta).toSorted(byCreatedThenId),
  };
}
