import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import fc from "fast-check";
import type { SetBlockRow } from "../src/index.ts";
import { crc32, openSqliteStorage, StorageError } from "../src/index.ts";
// the entry does not export the migrations: no other workspace reads them
import { MIGRATIONS } from "../src/sqlite/migrations.ts";
import {
  DOC,
  HOME,
  checkpointsPath,
  createTempTrees,
  doc,
  docPath,
  rawSql,
  tableNames,
  tableColumns,
  userVersion,
} from "./raw.ts";

const trees = createTempTrees("manent storage-");
afterAll(() => trees.removeAll());

const PRODUCTION_TABLES = [
  "issued_scene_numbers",
  "page_locks",
  "production",
  "production_requests",
  "revision_issues",
  "revision_set_blocks",
  "revision_sets",
];

const block = (
  ranges: Pick<SetBlockRow, "inserted" | "deletedAt">,
): SetBlockRow => ({
  setId: "set-1",
  blockId: "b1",
  pageLabel: "12",
  change: "changed",
  hash: "0a1b2c3d",
  ...ranges,
});

/** The code of the StorageError `read` throws; null when it reads. */
function codeOf(read: () => unknown): StorageError["code"] | null {
  try {
    read();
    return null;
  } catch (error) {
    if (error instanceof StorageError) return error.code;
    throw error;
  }
}

test("migration 5 creates the production tables and raises every file's version", async () => {
  const dir = await trees.tree();
  const storage = openSqliteStorage({ dir, now: () => 1_000 });
  // the checkpoints file is opened on first use
  storage.open(HOME).checkpoints.newest(DOC, 1);
  storage.close();
  const file = docPath(dir, HOME);
  const controlFile = join(dir, "control.sqlite");
  const checkpointsFile = checkpointsPath(dir, HOME);
  expect([
    userVersion(file),
    userVersion(controlFile),
    userVersion(checkpointsFile),
  ]).toEqual([5, 5, 5]);
  expect(tableColumns(file).page_locks).toEqual([
    "doc_id TEXT",
    "lock_level INTEGER",
    "page_order INTEGER",
    "label TEXT",
    "block_id TEXT",
    "offset INTEGER",
    "quote TEXT",
    "fallback_ids TEXT",
    "source TEXT",
    "from_generation INTEGER",
    "from_seq INTEGER",
    "to_generation INTEGER",
    "to_seq INTEGER",
  ]);
});

test("a file at version 4 is migrated in place", async () => {
  const dir = await trees.tree();
  const files = {
    control: join(dir, "control.sqlite"),
    documents: docPath(dir, HOME),
    checkpoints: checkpointsPath(dir, HOME),
  };
  for (const kind of ["control", "documents", "checkpoints"] as const) {
    await Bun.write(files[kind], "");
    for (const statement of MIGRATIONS[kind].slice(0, 4).flat())
      rawSql(files[kind], statement);
    rawSql(files[kind], "PRAGMA user_version = 4");
  }
  rawSql(
    files.documents,
    "INSERT INTO documents (id, kind, schema_version, created_at, locked) VALUES (?1, 'script', 1, 500, 0)",
    DOC,
  );
  rawSql(
    files.documents,
    `INSERT INTO doc_updates (doc_id, generation, seq, update_blob, crc32, user_id, created_at)
     VALUES (?1, 1, 1, x'01', ?2, 'sam', 500)`,
    DOC,
    crc32(new Uint8Array([1])),
  );
  const storage = openSqliteStorage({ dir, now: () => 1_000 });
  const file = storage.open(HOME);
  file.checkpoints.newest(DOC, 1);
  const opened = {
    tail: file.log
      .tail(DOC, 1, 0)
      .rows.map((r) => [r.seq, [...r.update], r.userId]),
    locked: file.log.get(DOC)?.locked,
    anchors: file.production.anchors(DOC),
  };
  storage.close();
  expect(opened).toEqual({ tail: [[1, [1], "sam"]], locked: 0, anchors: [] });
  expect(Object.values(files).map(userVersion)).toEqual([5, 5, 5]);
  expect(
    tableNames(files.documents).filter((name) =>
      PRODUCTION_TABLES.includes(name),
    ),
  ).toEqual(PRODUCTION_TABLES);
});

// A file holding one row of each table with a JSON column, and the reads of them.
async function damageable() {
  const dir = await trees.tree();
  const storage = openSqliteStorage({ dir, now: () => 1_000 });
  const f = storage.open(HOME);
  f.log.create(doc(DOC));
  f.production.put({
    docId: DOC,
    numbering: "suffix",
    colourOrder: ["white", "blue"],
    lockedAt: 1_000,
    lockedOn: "2026-10-27",
    lockedByUserId: "priya",
    endedAt: null,
  });
  f.production.replaceAnchors(
    DOC,
    [
      {
        level: 1,
        order: 1,
        label: "1",
        blockId: "b1",
        offset: 0,
        quote: null,
        fallbackIds: ["b2"],
        source: "lock",
      },
    ],
    { generation: 1, seq: 0 },
  );
  f.production.putSetBlocks("set-1", [
    block({ inserted: [[0, 2]], deletedAt: [1] }),
  ]);
  f.production.addIssue({
    id: "i1",
    docId: DOC,
    setId: "set-1",
    kind: "issue",
    versionId: "v1",
    issuedByUserId: "priya",
    issuedAt: 2_000,
    issuedOn: "2026-11-16",
    recipientUserIds: ["sam"],
    pages: ["3"],
    memo: "Blue revisions 16 Nov: p. 3",
    files: ["pdf_marked"],
    tint: false,
    what: "changed",
  });
  return { storage, f, path: docPath(dir, HOME) };
}

test("a stored list, range or kind that does not parse is damage, never a value", async () => {
  const { storage, f, path } = await damageable();
  const production = () => f.production.get(DOC);
  const anchors = () => f.production.anchors(DOC);
  const blocks = () => f.production.setBlocks("set-1");
  const issues = () => f.production.issues(DOC);
  const cases: [
    table: string,
    column: string,
    damaged: string,
    good: string,
    read: () => unknown,
  ][] = [
    ["production", "colour_order", "white", '["white"]', production],
    ["production", "colour_order", '["white",2]', '["white"]', production],
    ["page_locks", "fallback_ids", "{}", "[]", anchors],
    [
      "revision_set_blocks",
      "ranges",
      "[]",
      '{"inserted":[],"deletedAt":[]}',
      blocks,
    ],
    [
      "revision_set_blocks",
      "ranges",
      '{"deletedAt":[]}',
      '{"inserted":[],"deletedAt":[]}',
      blocks,
    ],
    [
      "revision_set_blocks",
      "ranges",
      '{"inserted":[[1]],"deletedAt":[]}',
      '{"inserted":[],"deletedAt":[]}',
      blocks,
    ],
    [
      "revision_set_blocks",
      "ranges",
      '{"inserted":[[1,2.5]],"deletedAt":[]}',
      '{"inserted":[],"deletedAt":[]}',
      blocks,
    ],
    [
      "revision_set_blocks",
      "ranges",
      '{"inserted":[],"deletedAt":[-1]}',
      '{"inserted":[],"deletedAt":[]}',
      blocks,
    ],
    [
      "revision_set_blocks",
      "ranges",
      '{"inserted":[]}',
      '{"inserted":[],"deletedAt":[]}',
      blocks,
    ],
    ["revision_issues", "kind", "publish", "issue", issues],
    ["revision_issues", "recipients", '"sam"', "[]", issues],
    ["revision_issues", "pages", "[3]", "[]", issues],
    ["revision_issues", "files", "", "[]", issues],
  ];
  const codes = cases.map(([table, column, damaged, good, read]) => {
    rawSql(path, `UPDATE ${table} SET ${column} = ?1`, damaged);
    const code = codeOf(read);
    rawSql(path, `UPDATE ${table} SET ${column} = ?1`, good);
    return { table, column, damaged, code };
  });
  const repaired = [production, anchors, blocks, issues].map(codeOf);
  storage.close();
  expect(codes).toEqual(
    cases.map(([table, column, damaged]) => ({
      table,
      column,
      damaged,
      code: "corrupt",
    })),
  );
  expect(repaired).toEqual([null, null, null, null]);
});

const ranges = fc.record({
  inserted: fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 4 }),
  deletedAt: fc.array(fc.nat(), { maxLength: 4 }),
});

test("a block's ranges read back as they were written", async () => {
  const { storage, f } = await damageable();
  fc.assert(
    fc.property(ranges, (written) => {
      f.production.putSetBlocks("set-1", [block(written)]);
      expect(f.production.setBlocks("set-1")).toEqual([block(written)]);
    }),
    { numRuns: 100 },
  );
  storage.close();
});

// near-valid ranges: each field present or not, each element well formed or not
const storedRanges = fc.oneof(
  ranges.map((value) => JSON.stringify(value)),
  fc
    .record(
      {
        inserted: fc.array(
          fc.oneof(
            fc.tuple(fc.nat(), fc.nat()),
            fc.array(fc.integer(), { maxLength: 3 }),
            fc.string(),
          ),
          {
            maxLength: 3,
          },
        ),
        deletedAt: fc.array(
          fc.oneof(fc.nat(), fc.integer({ max: -1 }), fc.double(), fc.string()),
          { maxLength: 3 },
        ),
      },
      { requiredKeys: [] },
    )
    .map((value) => JSON.stringify(value)),
  fc.json(),
  fc.string(),
);

const isOffset = (value: unknown): boolean =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isPair = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 2 && value.every(isOffset);

test("stored ranges either read as written or are damage", async () => {
  const { storage, f, path } = await damageable();
  fc.assert(
    fc.property(storedRanges, (text) => {
      rawSql(path, "UPDATE revision_set_blocks SET ranges = ?1", text);
      const code = codeOf(() => f.production.setBlocks("set-1"));
      if (code !== null) {
        expect(code).toBe("corrupt");
        return;
      }
      const [read] = f.production.setBlocks("set-1");
      expect(JSON.parse(text)).toMatchObject({
        inserted: read?.inserted,
        deletedAt: read?.deletedAt,
      });
      expect([
        read?.inserted.every(isPair),
        read?.deletedAt.every(isOffset),
      ]).toEqual([true, true]);
    }),
    { numRuns: 200 },
  );
  storage.close();
});
