import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createTempTrees } from "../src/index.ts";

test("a tree holds the files it was given and is gone after removeAll", async () => {
  const trees = createTempTrees("manent-test-");
  const root = await trees.tree({ "a/b.txt": "one", "c.txt": "two" });
  expect(await Bun.file(join(root, "a/b.txt")).text()).toBe("one");
  expect(await Bun.file(join(root, "c.txt")).text()).toBe("two");
  const empty = await trees.tree({});
  expect(await readdir(empty)).toEqual([]);
  expect(empty).not.toBe(root);
  await trees.removeAll();
  expect([existsSync(root), existsSync(empty)]).toEqual([false, false]);
});
