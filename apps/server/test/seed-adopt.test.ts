import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createRng } from "@manent/demo";
import { openSqliteStorage } from "@manent/storage";
import { indexDocId } from "@manent/sync-protocol";
import { createTempTrees } from "@manent/testkit";
import { adoptStaging } from "../src/seed/adopt.ts";
import { createSeedServer } from "../src/seed/server.ts";

const trees = createTempTrees("manent-seed-adopt-");
afterAll(() => trees.removeAll());

test("adopting staged files commits all directory entries in one control transaction", async () => {
  const root = await trees.tree({});
  const dataDir = join(root, "data");
  const stagingDir = join(root, "staging");
  await mkdir(dataDir, { recursive: true });
  await mkdir(stagingDir, { recursive: true });

  const projectId = "11111111-1111-7111-8111-111111111111";
  const home = { kind: "project", id: projectId } as const;
  const heavyIndex = indexDocId("workspace", "heavy");
  const heavyHome = { kind: "project", id: heavyIndex } as const;

  const staged = openSqliteStorage({ dir: stagingDir, now: () => 1_000 });
  for (let i = 1; i <= 10; i++) {
    const id = `00000000-0000-7000-8000-${String(i).padStart(12, "0")}`;
    staged.directory.place(id, home, "script", "dana");
    staged.directory.setRole(id, "dana", "owner", []);
    staged.directory.setRole(id, "sam", "edit", []);
  }
  staged.directory.place(heavyIndex, heavyHome, "index", "dana");
  staged.directory.setRole(heavyIndex, "dana", "owner", []);
  staged.close();

  const inner = openSqliteStorage({ dir: dataDir, now: () => 2_000 });
  let txCount = 0;
  let inTx = false;
  let writesOutsideTx = 0;
  const live = {
    ...inner,
    directory: {
      ...inner.directory,
      place: (...args: Parameters<typeof inner.directory.place>) => {
        if (!inTx) writesOutsideTx += 1;
        return inner.directory.place(...args);
      },
      setRole: (...args: Parameters<typeof inner.directory.setRole>) => {
        if (!inTx) writesOutsideTx += 1;
        return inner.directory.setRole(...args);
      },
    },
    transaction<T>(fn: () => T): T {
      txCount += 1;
      inTx = true;
      try {
        return inner.transaction(fn);
      } finally {
        inTx = false;
      }
    },
  };

  await adoptStaging({
    live,
    stagingDir,
    dataDir,
    homes: new Set([`project:${projectId}`, `project:${heavyIndex}`]),
  });

  // All 11 docs + 21 roles committed in a single control.sqlite transaction
  expect(txCount).toBe(1);
  expect(writesOutsideTx).toBe(0);
  expect(inner.directory.documentsIn(home).length).toBe(10);
  expect(inner.directory.placeOf(heavyIndex)).toEqual({
    home: heavyHome,
    kind: "index",
  });
  inner.close();
});

test("seeding leaves search off and writes no throwaway search index file", async () => {
  const dataDir = await trees.tree({});
  const seedServer = await createSeedServer({
    dataDir,
    seedAt: 1_763_000_000_000,
    rng: createRng(42),
  });
  await seedServer.close();
  expect(existsSync(join(dataDir, "search.sqlite"))).toBe(false);
});
