import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { DocFile, Storage } from "../src/index.ts";
import { openSqliteStorage } from "../src/index.ts";
import {
  DOC,
  HOME,
  PROJECT,
  codeOfOpening,
  createTempTrees,
  doc,
  docPath,
  integrityCheck,
  item,
  range,
  rawSql,
  readLinesFor,
} from "./raw.ts";

// real processes
const trees = createTempTrees("manent crash-");
const now = () => 1_000;
let dir: string;
let s: Storage;
let f: DocFile;

beforeEach(async () => {
  dir = await trees.tree();
  s = openSqliteStorage({ dir, now });
  f = s.open(HOME);
  f.log.create(doc(DOC));
});
afterEach(() => s.close());
afterAll(() => trees.removeAll());

test(
  "a process killed while appending loses nothing it reported",
  async () => {
    const killed = await trees.tree();
    for (let round = 0; round < 20; round++) {
      const child = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, "crash-child.ts"),
          killed,
          String(round),
        ],
        { stdout: "pipe", stderr: "inherit" },
      );
      // read "committed <seq>" lines for 30–200 ms
      const reported = await readLinesFor(child, 30 + ((round * 37) % 170));
      child.kill("SIGKILL");
      await child.exited;
      const storage = openSqliteStorage({ dir: killed, now: () => 1_000 });
      const file = storage.open(HOME);
      const rows = file.log.tail(DOC, 1, 0);
      // nothing torn
      expect(rows.corrupt).toEqual([]);
      // dense: no hole
      expect(rows.rows.map((r) => r.seq)).toEqual(range(1, rows.rows.length));
      // every reported commit is there
      for (const seq of reported)
        expect(seq).toBeLessThanOrEqual(file.log.get(DOC)!.headSeq);
      expect(integrityCheck(docPath(killed, HOME))).toBe("ok");
      storage.close();
    }
  },
  { timeout: 120_000 },
);

test(
  "a damaged row never stops the others loading",
  () => {
    f.transaction(() => {
      for (let n = 1; n <= 200; n++) f.log.append(item(n));
    });
    for (const seq of [50, 120])
      rawSql(
        docPath(dir, HOME),
        "UPDATE doc_updates SET update_blob = CAST(x'ff' || substr(update_blob, 2) AS BLOB) WHERE doc_id = ?1 AND seq = ?2",
        DOC,
        seq,
      );
    const tail = f.log.tail(DOC, 1, 0);
    expect([tail.rows.length, tail.corrupt]).toEqual([198, [50, 120]]);
    expect(f.log.healing(DOC)!.verifiedSeq).toBe(49);
    expect(f.log.tail(DOC, 1, 0).corrupt).toEqual([]);
  },
  { timeout: 120_000 },
);

test(
  "a truncated or foreign file is refused in one error",
  async () => {
    s.close();
    await Bun.write(join(dir, `project-${PROJECT}.sqlite`), "not a database");
    // a StorageError, never a raw SQLite error
    expect(codeOfOpening(dir)).toBe("corrupt");
  },
  { timeout: 120_000 },
);
