import { afterAll, afterEach, expect, test } from "bun:test";
import type { AppendItem, DocFile, Storage } from "../src/index.ts";
import { openSqliteStorage, StorageError } from "../src/index.ts";
import { createMemoryStorage, limitPages } from "../src/testing/index.ts";
import { DOC, HOME, createTempTrees, doc } from "./raw.ts";

const trees = createTempTrees("manent storage-");
const now = () => 1_000;
let storage: Storage | null = null;
afterEach(() => storage?.close());
afterAll(() => trees.removeAll());

const create = (file: DocFile, docId: string) => file.log.create(doc(docId));

const bigItem = (docId: string, size: number): AppendItem => ({
  docId,
  generation: 1,
  update: new Uint8Array(size).fill(7),
  userId: "sam",
  origin: "edit",
  clocks: [{ clientId: 7, clock: 1 }],
});

const capPages = (file: DocFile, pages: number) =>
  limitPages(storage!, file.home, pages);

// What a write throws, or null when it throws nothing.
function thrownBy(write: () => void): unknown {
  try {
    write();
  } catch (error) {
    return error;
  }
  return null;
}

const codeOf = (error: unknown) =>
  error instanceof StorageError ? error.code : error;

test("a full disk is its own code and writes nothing", async () => {
  storage = openSqliteStorage({ dir: await trees.tree(), now });
  const file = storage.open(HOME);
  create(file, DOC);
  capPages(file, 8);
  const error = thrownBy(() =>
    file.transaction(() => file.log.append(bigItem(DOC, 64 * 1024))),
  );
  expect(error).toBeInstanceOf(StorageError);
  expect((error as StorageError).code).toBe("disk_full");
  expect(file.log.get(DOC)!.headSeq).toBe(0);
  capPages(file, 1_000_000);
  file.transaction(() => file.log.append(bigItem(DOC, 64 * 1024)));
  expect(file.log.get(DOC)!.headSeq).toBe(1);
});

test("a page limit is only for the SQLite driver", () => {
  storage = createMemoryStorage({ now });
  expect(() => capPages(storage!.open(HOME), 8)).toThrow(RangeError);
});

test("the memory driver fills and frees on demand", () => {
  const memory = createMemoryStorage({ now });
  storage = memory;
  const file = memory.open(HOME);
  create(file, DOC);
  memory.fillDisk(true);
  expect(codeOf(thrownBy(() => file.log.append(bigItem(DOC, 4))))).toBe(
    "disk_full",
  );
  expect(
    codeOf(
      thrownBy(() => file.transaction(() => file.log.append(bigItem(DOC, 4)))),
    ),
  ).toBe("disk_full");
  expect(file.log.get(DOC)!.headSeq).toBe(0);
  memory.fillDisk(false);
  expect(file.log.append(bigItem(DOC, 4))).toBe(1);
  memory.failNextCommit("disk_full");
  expect(codeOf(thrownBy(() => file.log.append(bigItem(DOC, 4))))).toBe(
    "disk_full",
  );
  memory.failNextCommit();
  expect(codeOf(thrownBy(() => file.log.append(bigItem(DOC, 4))))).toBe(
    "commit_failed",
  );
  expect(file.log.append(bigItem(DOC, 4))).toBe(2);
});
