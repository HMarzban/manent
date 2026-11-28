// The directory in control.sqlite: where each document lives, who holds which role, and what is deleted.
import type { Database } from "bun:sqlite";
import { homeKey, parseHome, wellFormedKey } from "../home.ts";
import type { DocDirectory, Home, ShareLinkStore } from "../ports/index.ts";
import { StorageError } from "../ports/index.ts";
import { transact } from "./files.ts";

interface PlaceRow {
  home: string;
  kind: string;
}

function readHome(key: string): Home {
  const home = parseHome(key);
  if (home === null) throw new StorageError("corrupt");
  return home;
}

function readPlace(row: PlaceRow | null) {
  if (row === null) return null;
  return { home: readHome(row.home), kind: row.kind };
}

/** A stored JSON array of strings; StorageError("corrupt") for anything else. */
export function readStrings(text: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new StorageError("corrupt", { cause: error });
  }
  if (
    Array.isArray(value) &&
    value.every((c): c is string => typeof c === "string")
  )
    return value;
  throw new StorageError("corrupt");
}

/** The directory over an open, migrated control.sqlite. */
export function createSqliteDirectory(options: {
  db: Database;
  now: () => number;
}): DocDirectory {
  const { db, now } = options;
  const sql = {
    place: db.query<never, [string, string, string, string, number]>(
      "INSERT INTO doc_directory (doc_id, home, kind, created_by_user_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
    ),
    placeOf: db.query<PlaceRow, [string]>(
      "SELECT home, kind FROM doc_directory WHERE doc_id = ?1",
    ),
    documentsIn: db.query<{ doc_id: string }, [string]>(
      "SELECT doc_id FROM doc_directory WHERE home = ?1 ORDER BY doc_id",
    ),
    documentsInByKind: db.query<{ doc_id: string }, [string, string]>(
      "SELECT doc_id FROM doc_directory WHERE home = ?1 AND kind = ?2 ORDER BY doc_id",
    ),
    homes: db.query<{ home: string }, []>(
      "SELECT DISTINCT home FROM doc_directory ORDER BY home",
    ),
    setRole: db.query<never, [string, string, string, string]>(
      "INSERT INTO doc_roles (doc_id, user_id, role, capabilities) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (doc_id, user_id) DO UPDATE SET role = excluded.role, capabilities = excluded.capabilities",
    ),
    removeRole: db.query<never, [string, string]>(
      "DELETE FROM doc_roles WHERE doc_id = ?1 AND user_id = ?2",
    ),
    roleOf: db.query<{ role: string; capabilities: string }, [string, string]>(
      "SELECT role, capabilities FROM doc_roles WHERE doc_id = ?1 AND user_id = ?2",
    ),
    rolesOf: db.query<
      { userId: string; role: string; capabilities: string },
      [string]
    >(
      "SELECT user_id AS userId, role, capabilities FROM doc_roles WHERE doc_id = ?1 ORDER BY user_id",
    ),
    roleBesides: db.query<{ held: 1 }, [string, string]>(
      "SELECT 1 AS held FROM doc_roles WHERE doc_id = ?1 AND user_id <> ?2 LIMIT 1",
    ),
    tombstone: db.query<never, [string, string, number]>(
      "INSERT INTO tombstones (doc_id, deleted_by_user_id, deleted_at) VALUES (?1, ?2, ?3) ON CONFLICT (doc_id) DO NOTHING",
    ),
    tombstoneOf: db.query<
      { deletedByUserId: string; deletedAt: number },
      [string]
    >(
      "SELECT deleted_by_user_id AS deletedByUserId, deleted_at AS deletedAt FROM tombstones WHERE doc_id = ?1",
    ),
  };
  const write = (fn: () => unknown): void => {
    transact(db, fn);
  };
  return {
    place(docId, home, kind, createdByUserId) {
      const key = wellFormedKey(home);
      return transact(db, () => {
        const existing = readPlace(sql.placeOf.get(docId));
        if (existing !== null) return { ...existing, created: false };
        sql.place.run(docId, key, kind, createdByUserId, now());
        return { home: { ...home }, kind, created: true };
      });
    },
    placeOf: (docId) => readPlace(sql.placeOf.get(docId)),
    documentsIn: (home, kind) =>
      (kind === undefined
        ? sql.documentsIn.all(homeKey(home))
        : sql.documentsInByKind.all(homeKey(home), kind)
      ).map((row) => row.doc_id),
    homes: () => sql.homes.all().map((row) => readHome(row.home)),
    setRole: (docId, userId, role, capabilities) =>
      write(() =>
        sql.setRole.run(docId, userId, role, JSON.stringify(capabilities)),
      ),
    removeRole: (docId, userId) =>
      write(() => sql.removeRole.run(docId, userId)),
    roleOf(docId, userId) {
      const row = sql.roleOf.get(docId, userId);
      if (row === null) return null;
      return {
        role: row.role,
        capabilities: readStrings(row.capabilities),
      };
    },
    rolesOf: (docId) =>
      sql.rolesOf.all(docId).map((row) => ({
        userId: row.userId,
        role: row.role,
        capabilities: readStrings(row.capabilities),
      })),
    hasRoleBesides: (docId, userId) =>
      sql.roleBesides.get(docId, userId) !== null,
    tombstone: (docId, deletedByUserId) =>
      write(() => sql.tombstone.run(docId, deletedByUserId, now())),
    tombstoneOf: (docId) => sql.tombstoneOf.get(docId),
  };
}

/** The grants' reads and writes of `doc_roles`: where each role came from and when its holder was last active. */
export function createSqliteGrants(options: {
  db: Database;
  now: () => number;
}): Pick<
  ShareLinkStore,
  "grant" | "ungrant" | "grantsOf" | "markActive" | "lastActiveOf"
> {
  const { db, now } = options;
  const sql = {
    grant: db.query<never, [string, string, string, string]>(
      "INSERT INTO doc_roles (doc_id, user_id, role, source) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (doc_id, user_id) DO UPDATE SET role = excluded.role, source = excluded.source",
    ),
    ungrant: db.query<never, [string, string, string]>(
      "DELETE FROM doc_roles WHERE doc_id = ?1 AND user_id = ?2 AND source = ?3",
    ),
    grantsOf: db.query<
      { userId: string; role: string; source: string },
      [string]
    >(
      "SELECT user_id AS userId, role, source FROM doc_roles WHERE doc_id = ?1 ORDER BY user_id",
    ),
    markActive: db.query<never, [string, string, number]>(
      "UPDATE doc_roles SET last_active_at = ?3 WHERE doc_id = ?1 AND user_id = ?2",
    ),
    lastActiveOf: db.query<
      { userId: string; lastActiveAt: number | null },
      [string]
    >(
      "SELECT user_id AS userId, last_active_at AS lastActiveAt FROM doc_roles WHERE doc_id = ?1 ORDER BY user_id",
    ),
  };
  return {
    grant: (docId, userId, role, source) =>
      transact(db, () => sql.grant.run(docId, userId, role, source)),
    ungrant: (docId, userId, source) =>
      transact(db, () => sql.ungrant.run(docId, userId, source)),
    grantsOf: (docId) => sql.grantsOf.all(docId),
    markActive: (docId, userId) =>
      transact(db, () => sql.markActive.run(docId, userId, now())),
    lastActiveOf: (docId) => sql.lastActiveOf.all(docId),
  };
}
