// A cap on the pages of one SQLite document file, so that SQLite answers SQLITE_FULL as a full disk would.
import type { Home, Storage } from "../ports/index.ts";
import { connectionOf } from "../sqlite/doc-file.ts";

/**
 * Sets PRAGMA max_page_count on the driver's own connection to the home's file: the cap is per
 * connection, so another connection would not do. SQLite raises a cap below the file's size to that
 * size. RangeError for a storage that is not the SQLite driver.
 */
export function limitPages(storage: Storage, home: Home, pages: number): void {
  const db = connectionOf(storage.open(home));
  if (db === null)
    throw new RangeError("a page limit needs the SQLite storage driver");
  db.run(`PRAGMA max_page_count = ${pages}`);
}
