// How much this device stores: the node's scripts and the size of every file of the store.
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const COUNT_SCRIPTS =
  "SELECT count(*) AS scripts FROM doc_directory AS d WHERE d.kind = 'script' AND NOT EXISTS (SELECT 1 FROM tombstones AS t WHERE t.doc_id = d.doc_id)";

function countScripts(control: string): number {
  if (!existsSync(control)) return 0;
  const db = new Database(control, { readonly: true });
  try {
    return db.query<{ scripts: number }, []>(COUNT_SCRIPTS).get()?.scripts ?? 0;
  } finally {
    db.close();
  }
}

/** scripts: placed documents of kind script without a tombstone, from node/control.sqlite; bytes: every file under `storeDir`. */
export function readStoreUsage(storeDir: string): {
  scripts: number;
  bytes: number;
} {
  const scripts = countScripts(join(storeDir, "node", "control.sqlite"));
  const bytes = readdirSync(storeDir, { recursive: true, encoding: "utf8" })
    .map((path) => statSync(join(storeDir, path)))
    .filter((stat) => stat.isFile())
    .reduce((sum, stat) => sum + stat.size, 0);
  return { scripts, bytes };
}
