// The SQLite driver: the directory in control.sqlite, and one file per home beside it, each opened on first use.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { wellFormedKey } from "../home.ts";
import type { Storage } from "../ports.ts";
import { createSqliteDirectory } from "./directory.ts";
import type { SqliteDocFile } from "./doc-file.ts";
import { openDocFile } from "./doc-file.ts";
import { CONTROL_FILE, migrate, openDatabase } from "./files.ts";

/**
 * Storage in `dir`, which is created when missing. StorageError("corrupt") for
 * a file SQLite cannot read or a later build wrote; nothing is migrated downwards.
 */
export function openSqliteStorage(options: {
  dir: string;
  now: () => number;
}): Storage {
  const { dir, now } = options;
  mkdirSync(dir, { recursive: true });
  const control = openDatabase(join(dir, CONTROL_FILE));
  try {
    migrate(control, "control");
  } catch (error) {
    control.close();
    throw error;
  }
  const files = new Map<string, SqliteDocFile>();
  return {
    directory: createSqliteDirectory({ db: control, now }),
    open(home) {
      const key = wellFormedKey(home);
      const file = files.get(key) ?? openDocFile({ dir, home, now });
      files.set(key, file);
      return file;
    },
    close() {
      for (const file of files.values()) file.close();
      files.clear();
      control.close();
    },
  };
}
