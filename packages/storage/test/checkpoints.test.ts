import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { DocFile, Storage } from "../src/index.ts";
import { CHECKPOINT_FORMAT_VERSION, openSqliteStorage } from "../src/index.ts";
import {
  DOC,
  HOME,
  PROJECT,
  checkpointsPath,
  createTempTrees,
  doc,
  item,
  rawConnection,
  rawRows,
  tableNames,
} from "./raw.ts";

const trees = createTempTrees("manent storage-");
const now = () => 1_000;
let dir: string;
let s: Storage;
let f: DocFile;

beforeEach(async () => {
  dir = await trees.tree();
  s = openSqliteStorage({ dir, now });
  f = s.open(HOME);
  f.log.create(doc(DOC));
  // the checkpoints file is opened on first use
  f.checkpoints.newest(DOC, 1);
});
afterEach(() => s.close());
afterAll(() => trees.removeAll());

test(
  "a checkpoint row is exactly this",
  () => {
    f.checkpoints.put(DOC, 1, 7, new Uint8Array([1, 2, 3]));
    expect(
      rawRows(
        checkpointsPath(dir, HOME),
        "SELECT doc_id, generation, seq, state, hex(sha256) AS sha, created_at FROM doc_checkpoints",
      ),
    ).toEqual([
      {
        doc_id: DOC,
        generation: 1,
        seq: 7,
        state: new Uint8Array([1, 2, 3]),
        sha: "039058C6F2C0CB492C533B0A4D14EF77CC0F78ABCCCED5287D84A1A2011CFB81",
        created_at: 1_000,
      },
    ]);
    expect(CHECKPOINT_FORMAT_VERSION).toBe(1);
  },
  { timeout: 20_000 },
);

test(
  "checkpoints live in a file of their own",
  async () => {
    expect((await readdir(dir)).toSorted()).toContain(
      `project-${PROJECT}.checkpoints.sqlite`,
    );
    expect(tableNames(join(dir, `project-${PROJECT}.sqlite`))).not.toContain(
      "doc_checkpoints",
    );
  },
  { timeout: 20_000 },
);

test(
  "deleting the checkpoint file loses nothing",
  async () => {
    for (const n of [1, 2, 3]) f.log.append(item(n));
    f.checkpoints.put(DOC, 1, 3, new Uint8Array([9]));
    s.close();
    for (const suffix of ["", "-wal", "-shm"])
      await rm(checkpointsPath(dir, HOME) + suffix, { force: true });
    s = openSqliteStorage({ dir, now });
    const again = s.open(HOME);
    expect(again.checkpoints.newest(DOC, 1)).toBeNull();
    expect(again.log.tail(DOC, 1, 0).rows.map((r) => r.seq)).toEqual([1, 2, 3]);
  },
  { timeout: 20_000 },
);

test(
  "a checkpoint being written does not hold the log's writer",
  () => {
    // another connection holds the checkpoints file's write lock
    const busy = rawConnection(checkpointsPath(dir, HOME));
    busy.run("BEGIN IMMEDIATE");
    const started = performance.now();
    expect(f.transaction(() => f.log.append(item(1)))).toBe(1);
    // in one file this would wait out busy_timeout (5 s) and fail
    expect(performance.now() - started).toBeLessThan(1_000);
    busy.run("ROLLBACK");
    busy.close();
  },
  { timeout: 20_000 },
);

test(
  "compressible checkpoints are stored deflated and corrupt compressed bytes drop cleanly",
  () => {
    const big = new Uint8Array(2_048);
    for (let i = 0; i < big.length; i++) big[i] = i % 13;
    f.checkpoints.put(DOC, 1, 10, big);
    const db = rawConnection(checkpointsPath(dir, HOME));
    const stored = db
      .query<{ seq: number; len: number; encoding: number }, [string]>(
        "SELECT seq, length(state) AS len, encoding FROM doc_checkpoints WHERE doc_id = ?1",
      )
      .all(DOC);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.encoding).toBe(1);
    expect(stored[0]!.len).toBeLessThan(big.byteLength / 4);
    expect(f.checkpoints.newest(DOC, 1)).toEqual({ seq: 10, state: big });

    // Corrupt the compressed payload and verify atOrBefore drops it cleanly instead of throwing
    db.run(
      "UPDATE doc_checkpoints SET state = x'ff00ff00' WHERE doc_id = ?1 AND seq = 10",
      [DOC],
    );
    db.close();
    expect(f.checkpoints.newest(DOC, 1)).toBeNull();
    expect(
      rawRows(checkpointsPath(dir, HOME), "SELECT seq FROM doc_checkpoints"),
    ).toEqual([]);
  },
  { timeout: 20_000 },
);
