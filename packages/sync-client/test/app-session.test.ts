import { expect, test } from "bun:test";
import { loadDoc } from "@manent/crdt";
import {
  CODE,
  indexDocId,
  projectHome,
  workspaceHome,
} from "@manent/sync-protocol";
import type { DocMeta, LocalStore, SyncClient } from "../src/index.ts";
import { blankMeta, createMemoryStore } from "../src/testing/index.ts";
import {
  B1,
  B2,
  DOC,
  seededMeta,
  setup,
  subscribed,
  textOf,
  type,
  typeIn,
} from "./scripted-server.ts";
import type { World } from "./scripted-server.ts";

/** The test client's userId. */
const USER = "dana";
const IDX = indexDocId("user", USER);
const PROJECT = "7c1e2a90-4b5d-4f3e-8a21-93d0c6b5e4f2";
const DOC2 = "01a1e81d-c6f2-7302-a0f6-5c345eb6c7cd";
const DOC3 = "01a1e81d-c6f2-7303-a0f6-5c345eb6c7cd";
const PRIVATE_INDEX = {
  create: { kind: "index", home: "user", workspaceId: null },
} as const;

function workspaceIndex(workspaceId: string) {
  const create = {
    kind: "index",
    home: workspaceHome(workspaceId),
    workspaceId: null,
  };
  return { docId: indexDocId("workspace", workspaceId), create };
}

/** The same device after a reload: a new client over the same store. */
async function reopened(w: World, client: SyncClient): Promise<SyncClient> {
  await client.close();
  return w.makeClient();
}

/** Back online after going offline: the backoff has passed and everything settled. */
async function reconnect(w: World): Promise<void> {
  w.fake.advance(30_000);
  await w.settle();
}

async function baseVectorOf(
  store: LocalStore,
  docId: string,
): Promise<Uint8Array> {
  const base = (await store.load(docId))?.syncedBase ?? null;
  if (base === null) throw new RangeError(`no synced base for ${docId}`);
  return loadDoc(base).encodeStateVector();
}

test("a document opened with a create request is created on the server at its first sync", async () => {
  const w = await setup();
  const { server } = w;
  const client = w.makeClient();
  await client.open(IDX, PRIVATE_INDEX);
  await w.settle();
  const index = { userId: USER, docId: IDX, kind: "index", home: "user" };
  expect(server.created).toEqual([index]);
  const again = await reopened(w, client);
  await again.open(IDX, PRIVATE_INDEX);
  await w.settle();
  // the stored meta decides
  expect(server.created).toEqual([index]);
  const medium = workspaceIndex("medium");
  await again.open(medium.docId, { create: medium.create });
  await w.settle();
  const script = await again.create({
    kind: "script",
    home: projectHome(PROJECT),
    workspaceId: "medium",
  });
  await w.settle();
  expect(server.created.at(-1)).toEqual({
    userId: USER,
    docId: script.docId,
    kind: "script",
    home: projectHome(PROJECT),
    workspaceId: "medium",
  });
});

test("a script waits to be created until its workspace's index is on the server", async () => {
  const w = await setup();
  const { server, store } = w;
  const writers = indexDocId("workspace", "writers");
  await store.create(seededMeta(writers));
  const client = w.makeClient();
  client.setOnline(false);
  const medium = workspaceIndex("medium");
  await client.open(medium.docId, { create: medium.create });
  const home = projectHome(PROJECT);
  const script = await client.create({
    kind: "script",
    home,
    workspaceId: "medium",
  });
  const member = await client.create({
    kind: "script",
    home,
    workspaceId: "writers",
  });
  server.answer.subscribe = false;
  client.setOnline(true);
  await w.settle();
  const created = () => server.created.map((c) => c.docId);
  expect(created()).toEqual([medium.docId, member.docId]);
  expect(script.status.get().docSync).toBe("local");
  server.send(subscribed(medium.docId, server.head));
  await w.settle();
  expect(created()).toEqual([medium.docId, member.docId, script.docId]);
});

test("a role that cannot edit is read through the viewer path", async () => {
  const w = await setup();
  const { server } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.settle();
  server.error(DOC, {
    code: CODE.FORBIDDEN,
    message: "read_only_role",
    permanent: false,
    clientSeq: null,
  });
  await w.settle();
  expect(h.status.get().side).toEqual(["view_only"]);
  expect(server.got("SUBSCRIBE").at(-1)).toMatchObject({ mode: "view" });
  expect(h.readOnly.get()).toBe(client.view(DOC));
});

test("the documents on this device are summarised without opening them", async () => {
  const w = await setup();
  const { store } = w;
  await store.create(blankMeta(DOC2));
  const parkedAt = 1_000;
  await store.create({
    ...seededMeta(DOC3),
    parked: { reason: "deleted", parkedAt },
  });
  await store.append(DOC3, {
    kind: "update",
    localSeq: 1,
    update: new Uint8Array(),
    own: true,
    acked: false,
    applied: true,
    elements: [B1],
  });
  await store.markApplied(DOC3, 0, [
    {
      id: "item-1",
      docId: DOC3,
      blockId: B1,
      nearBlockId: null,
      text: "gone",
      recoveredAt: parkedAt,
      cause: "merge",
    },
  ]);
  const client = w.makeClient();
  client.setOnline(false);
  const h = await client.open(DOC);
  typeIn(h, B1, "a");
  typeIn(h, B2, "b");
  await w.settle();
  expect(await client.documents()).toEqual([
    { docId: DOC, neverSynced: false, waiting: 2, parked: null, recovered: 0 },
    { docId: DOC2, neverSynced: true, waiting: 0, parked: null, recovered: 0 },
    {
      docId: DOC3,
      neverSynced: false,
      waiting: 1,
      parked: { reason: "deleted", parkedAt },
      recovered: 1,
    },
  ]);
});

test("a write the store refused is written again when it can be, and only then is the edit saved", async () => {
  const w = await setup();
  const { store, fake } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  client.setOnline(false);
  store.refuseWrites("quota");
  type(h, "a");
  type(h, "b");
  await w.settle();
  expect(h.status.get()).toMatchObject({
    saved: false,
    side: ["not_saved"],
    waiting: 1,
  });
  expect(textOf(h.doc())).toContain("ab");
  store.refuseWrites(null);
  fake.advance(4_999);
  await w.settle();
  expect(h.status.get().saved).toBe(false);
  fake.advance(1);
  await w.settle();
  expect(h.status.get()).toMatchObject({ saved: true, side: [] });
  // in order, each once
  expect((await store.load(DOC))!.entries.map((e) => e.localSeq)).toEqual([
    1, 2,
  ]);
});

test("after a reconnect the server is asked for everything since the last synced state", async () => {
  const w = await setup();
  const { server, store } = w;
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.settle();
  server.ackAll(DOC);
  await w.settle();
  const base = await baseVectorOf(store, DOC);
  client.setOnline(false);
  type(h, "offline");
  client.setOnline(true);
  await reconnect(w);
  const steps = server.got("SYNC").filter((s) => s.step === "step1");
  expect(steps.at(-1)!.data).toEqual(base);
});

test("a document stored before creates named a workspace reads as having none", async () => {
  const store = createMemoryStore(USER);
  // deliberately the older shape, without the field
  const older = { kind: "index", home: "user" } as DocMeta["create"];
  await store.create({ ...blankMeta(IDX), create: older });
  const meta = { ...blankMeta(IDX), create: PRIVATE_INDEX.create };
  expect((await store.load(IDX))!.meta).toEqual(meta);
  expect(await store.documents()).toEqual([meta]);
});
