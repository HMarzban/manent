// The store's version, made from the version of every kind of file inside it, and the store's own migration steps.
import { STORAGE_SCHEMA_VERSION } from "@manent/storage";
import { RECORDS_VERSION } from "../records/sqlite.ts";

/** `PRAGMA user_version` of an upstream outbox file. */
const SQLITE_STORE_VERSION = 1;

/** `storage * 10_000 + records * 100 + outbox`. RangeError for a version that is not an integer from 1 to 99. */
export function storeVersion(
  storage: number,
  records: number,
  outbox: number,
): number {
  for (const version of [storage, records, outbox])
    if (!Number.isInteger(version) || version < 1 || version > 99)
      throw new RangeError(
        `a file version must be an integer from 1 to 99, not ${version}`,
      );
  return storage * 10_000 + records * 100 + outbox;
}

/** This build's store version: it moves whenever a kind of file inside the store gains a version. */
export const STORE_VERSION: number = storeVersion(
  STORAGE_SCHEMA_VERSION,
  RECORDS_VERSION,
  SQLITE_STORE_VERSION,
);

/** Steps run on a copied store after the files' own migrations, keyed by the store version they reach. None yet. */
export const STORE_MIGRATIONS: Readonly<Record<number, (dir: string) => void>> =
  Object.freeze({});
