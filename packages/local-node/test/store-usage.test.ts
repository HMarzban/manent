import { afterAll, expect, test } from "bun:test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { openSqliteStorage } from "@manent/storage";
import { createTempTrees } from "@manent/testkit";
import { readStoreUsage } from "../src/index.ts";

const trees = createTempTrees("manent-usage-");
afterAll(() => trees.removeAll());

const PROJECT = {
  kind: "project",
  id: "0193b1f4-2c1e-7a00-8000-0000000000aa",
} as const;

function bytesUnder(dir: string): number {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((path) => statSync(join(dir, path)))
    .filter((stat) => stat.isFile())
    .reduce((sum, stat) => sum + stat.size, 0);
}

test("what is stored here is counted from the node's own files", async () => {
  const storeDir = await trees.tree({ "records.sqlite": "0123456789" });
  expect(readStoreUsage(storeDir)).toEqual({ scripts: 0, bytes: 10 });
  const storage = openSqliteStorage({
    dir: join(storeDir, "node"),
    now: () => 1,
  });
  const { directory } = storage;
  directory.place(
    "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd",
    PROJECT,
    "script",
    "sam",
  );
  directory.place(
    "0193b1f4-2c1e-7a00-8000-00000000000b",
    PROJECT,
    "script",
    "sam",
  );
  directory.place(
    "0193b1f4-2c1e-7a00-8000-00000000000c",
    PROJECT,
    "outline",
    "sam",
  );
  directory.tombstone("0193b1f4-2c1e-7a00-8000-00000000000b", "sam");
  const usage = readStoreUsage(storeDir);
  expect(usage).toEqual({ scripts: 1, bytes: bytesUnder(storeDir) });
  storage.close();
});
