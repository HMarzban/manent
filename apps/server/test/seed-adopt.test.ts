import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ORIGIN_LOAD, createDoc, jsonMap, updateMeta } from "@manent/crdt";
import { createRng } from "@manent/demo";
import { openSqliteStorage } from "@manent/storage";
import { indexDocId } from "@manent/sync-protocol";
import { createTempTrees } from "@manent/testkit";
import {
  STAGING_DONE,
  adoptStaging,
  resumeStaging,
} from "../src/seed/adopt.ts";
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

test("adoptStaging keeps live user:dana untouched when her home holds another document, and resumeStaging merges staged favourites", async () => {
  const root = await trees.tree({});
  const dataDir = join(root, "data");
  const stagingDir = join(root, "staging");
  await mkdir(dataDir, { recursive: true });
  await mkdir(stagingDir, { recursive: true });

  const danaIndex = indexDocId("user", "dana");
  const danaHome = { kind: "user", id: "dana" } as const;
  const heavyIndex = indexDocId("workspace", "heavy");
  const heavyHome = { kind: "project", id: heavyIndex } as const;
  const extraPrivateDoc = "22222222-2222-7222-8222-222222222222";

  // 1) When live has a document in user:dana (even without danaIndex placed), adoptStaging does NOT overwrite user-dana.sqlite
  const stagedA = openSqliteStorage({ dir: stagingDir, now: () => 1_000 });
  stagedA.directory.place(danaIndex, danaHome, "index", "dana");
  stagedA.directory.setRole(danaIndex, "dana", "owner", []);
  const stagedDanaDoc = createDoc({ clientId: 10 });
  jsonMap(stagedDanaDoc, "favourites").set("fav-staged", { addedAt: 1_000 });
  const stagedUpdate = stagedDanaDoc.encodeState();
  stagedA.open(danaHome).log.create({
    id: danaIndex,
    kind: "index",
    ownerUserId: "dana",
    schemaVersion: 1,
    engineVersion: null,
  });
  stagedA.open(danaHome).log.append({
    docId: danaIndex,
    generation: 1,
    update: stagedUpdate,
    userId: "dana",
    origin: "system",
    clocks: updateMeta(stagedUpdate).map(({ clientId, toClock }) => ({
      clientId,
      clock: toClock,
    })),
  });
  stagedA.directory.place(heavyIndex, heavyHome, "index", "dana");
  stagedA.directory.setRole(heavyIndex, "dana", "owner", []);
  stagedA.close();
  stagedDanaDoc.destroy();

  const liveA = openSqliteStorage({ dir: dataDir, now: () => 2_000 });
  liveA.directory.place(extraPrivateDoc, danaHome, "private", "dana");
  liveA.open(danaHome).log.create({
    id: extraPrivateDoc,
    kind: "private",
    ownerUserId: "dana",
    schemaVersion: 1,
    engineVersion: null,
  });
  await adoptStaging({
    live: liveA,
    stagingDir,
    dataDir,
    homes: new Set([`project:${heavyIndex}`]),
  });
  expect(liveA.open(danaHome).log.get(extraPrivateDoc)).not.toBeNull();
  expect(liveA.directory.placeOf(danaIndex)).toBeNull();
  liveA.close();

  // 2) resumeStaging applies stagedFavourites directly into Dana's live private index
  const rootB = await trees.tree({});
  const dataDirB = join(rootB, "data");
  const stagingDirB = join(rootB, "staging");
  await mkdir(dataDirB, { recursive: true });
  await mkdir(stagingDirB, { recursive: true });

  const stagedB = openSqliteStorage({ dir: stagingDirB, now: () => 1_000 });
  stagedB.directory.place(danaIndex, danaHome, "index", "dana");
  stagedB.directory.setRole(danaIndex, "dana", "owner", []);
  const stagedDocB = createDoc({ clientId: 11 });
  jsonMap(stagedDocB, "favourites").set("fav-staged", { addedAt: 1_000 });
  jsonMap(stagedDocB, "favourites").set("fav-live", { addedAt: 999 });
  const stagedUpdB = stagedDocB.encodeState();
  stagedB.open(danaHome).log.create({
    id: danaIndex,
    kind: "index",
    ownerUserId: "dana",
    schemaVersion: 1,
    engineVersion: null,
  });
  stagedB.open(danaHome).log.append({
    docId: danaIndex,
    generation: 1,
    update: stagedUpdB,
    userId: "dana",
    origin: "system",
    clocks: updateMeta(stagedUpdB).map(({ clientId, toClock }) => ({
      clientId,
      clock: toClock,
    })),
  });
  stagedB.directory.place(heavyIndex, heavyHome, "index", "dana");
  stagedB.directory.setRole(heavyIndex, "dana", "owner", []);
  stagedB.close();
  stagedDocB.destroy();
  await writeFile(join(stagingDirB, STAGING_DONE), "");

  const liveB = openSqliteStorage({ dir: dataDirB, now: () => 2_000 });
  liveB.directory.place(danaIndex, danaHome, "index", "dana");
  liveB.directory.setRole(danaIndex, "dana", "owner", []);
  const liveDocB = createDoc({ clientId: 12 });
  jsonMap(liveDocB, "favourites").set("fav-live", { addedAt: 2_000 });
  const liveUpdB = liveDocB.encodeState();
  liveB.open(danaHome).log.create({
    id: danaIndex,
    kind: "index",
    ownerUserId: "dana",
    schemaVersion: 1,
    engineVersion: null,
  });
  liveB.open(danaHome).log.append({
    docId: danaIndex,
    generation: 1,
    update: liveUpdB,
    userId: "dana",
    origin: "system",
    clocks: updateMeta(liveUpdB).map(({ clientId, toClock }) => ({
      clientId,
      clock: toClock,
    })),
  });
  liveDocB.destroy();

  const status = await resumeStaging({
    live: liveB,
    stagingDir: stagingDirB,
    dataDir: dataDirB,
    homes: new Set([`project:${heavyIndex}`]),
  });
  expect(status).toBe("adopted");

  const mergedDoc = createDoc({ clientId: 13 });
  for (const row of liveB.open(danaHome).log.tail(danaIndex, 1, 0).rows)
    mergedDoc.applyUpdate(row.update, ORIGIN_LOAD);
  expect(jsonMap(mergedDoc, "favourites").entries()).toEqual({
    "fav-live": { addedAt: 2_000 },
    "fav-staged": { addedAt: 1_000 },
  });
  mergedDoc.destroy();
  liveB.close();
});
