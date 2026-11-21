import { expect, test } from "bun:test";
import { loadDoc, scriptBody, scriptDocFromJSON } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { canonicalBlocksOf } from "@manent/revisions";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { StorageError } from "@manent/storage";
import type { DocFile, VersionCursor, VersionRow } from "@manent/storage";
import { createMemoryStorage } from "@manent/storage/testing";
import { isVersionCursor } from "@manent/sync-protocol";
import type {
  LockAnchorRecord,
  Message,
  VersionItem,
  VersionListResponse,
  VersionSet,
} from "@manent/sync-protocol";
import { createHistoryService, createSyncService } from "../src/index.ts";
import type {
  HistoryExtras,
  HistoryOutcome,
  SyncService,
} from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import type { FakePeer } from "../src/testing/index.ts";
import { DOC, HOME, PROJECT, appendAll } from "./seed.ts";
import { EMPTY_VECTOR, subscribe } from "./service-world.ts";

/** Midnight UTC, 1 June 2027. */
const T0 = 1_811_808_000_000;
const DAY_MS = 86_400_000;
const V1: VersionSet = { protocol: 1, schema: 1, engine: 0, table: 0 };
/** No connection is ever slowed down here. */
const OPEN_LIMITS = {
  framesPerSecond: 1e9,
  frameBurst: 1e9,
  bytesPerSecond: 1e12,
  byteBurst: 1e12,
};
const SEED_CLIENT = 9001;
const heading = (scene: number): string => `scene-heading-${scene}`;
const action = (scene: number): string => `scene-action-${scene}`;
const SCENE_2_ACTION = action(2);
const SCENE_5_ACTION = action(5);
const key = (n: number): string => n.toString(16).padStart(32, "0");

const ANCHOR: LockAnchorRecord = {
  level: 1,
  order: 0,
  label: "1",
  blockId: heading(1),
  offset: 0,
  quote: "INT. FERRY",
  fallbackIds: [],
  source: "lock",
};

/** Six scenes, each a heading and an action. */
const SCRIPT_BLOCKS: BlockJSON[] = Array.from({ length: 6 }, (_, i) => [
  {
    type: "block" as const,
    attrs: { id: heading(i + 1), type: "scene_heading" },
    content: [{ type: "text" as const, text: `INT. FERRY ${i + 1}` }],
  },
  {
    type: "block" as const,
    attrs: { id: action(i + 1), type: "action" },
    content: [{ type: "text" as const, text: "Gulls. " }],
  },
]).flat();
const SCRIPT: DocJSON = {
  type: "doc",
  content: [{ type: "section", content: SCRIPT_BLOCKS }],
};

/** One person's device: a replica taken from the server when it joins, and the edits it sends. */
interface Person {
  readonly peer: FakePeer;
  join(): void;
  type(blockId: string, text: string): void;
  /** An edit sent, left queued until the next commit. */
  send(blockId: string, text: string): void;
  /** `count` one-letter edits, committed in turns of 500. */
  typeMany(blockId: string, count: number): void;
  leave(): void;
  blocks(): BlockJSON[];
}

/** What the service world gives a test. */
function historyWorld(options: { extras?: HistoryExtras } = {}) {
  const clock = fakeClock(T0);
  const storage = createMemoryStorage({ now: () => clock.clock.now() });
  let made = 0;
  const ids = (): string => `v-${String(++made).padStart(5, "0")}`;
  const sync: { service: SyncService | null } = { service: null };
  const serviceOf = (): SyncService => {
    if (sync.service === null) throw new RangeError("no service yet");
    return sync.service;
  };
  const history = createHistoryService({
    sync: serviceOf,
    storage,
    clock: clock.clock,
    ids,
    ...options,
  });
  const service = createSyncService({
    storage,
    clock: clock.clock,
    defer: clock.defer,
    ids,
    versions: { current: V1, min: V1 },
    limits: OPEN_LIMITS,
    hooks: [history],
  });
  sync.service = service;
  service.access.create("sam", {
    docId: DOC,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  storage.directory.setRole(DOC, "dana", "edit", []);
  storage.directory.setRole(DOC, "leo", "view", []);
  const seed = scriptDocFromJSON(SCRIPT, { clientId: SEED_CLIENT });
  appendAll(storage, [seed.encodeState()], { userId: "sam" });
  const file = storage.open(HOME);

  const person = (peer: FakePeer, clientId: number): Person => {
    service.attach(peer);
    let doc: CrdtDoc | null = null;
    let generation = 0;
    let clientSeq = 0;
    const replica = (): CrdtDoc => {
      if (doc === null) throw new RangeError(`${peer.userId} has not joined`);
      return doc;
    };
    const edit = (blockId: string, text: string): void => {
      const body = scriptBody(replica());
      const block = canonicalBlocksOf(body.materialize()).find(
        (b) => b.attrs?.id === blockId,
      );
      const at = (block?.content ?? [])
        .map((part) => part.text)
        .join("").length;
      const sent: Uint8Array[] = [];
      const stop = replica().subscribe((update) => sent.push(update));
      body.write((w) => w.insertText(blockId, at, text));
      stop();
      for (const update of sent)
        service.receive(peer, {
          type: "PUSH",
          docId: DOC,
          generation,
          clientSeq: ++clientSeq,
          update,
          heal: false,
        });
    };
    return {
      peer,
      join() {
        service.receive(peer, subscribe(DOC, "edit", [clientId]));
        const joined = peer.take().find((m) => m.type === "SUBSCRIBED");
        if (joined?.type !== "SUBSCRIBED") throw new RangeError("not joined");
        generation = joined.generation;
        service.receive(peer, {
          type: "SYNC",
          docId: DOC,
          generation,
          step: "step1",
          data: EMPTY_VECTOR,
        });
        const state = peer
          .take()
          .find((m) => m.type === "SYNC" && m.step === "step2");
        if (state?.type !== "SYNC") throw new RangeError("no state was sent");
        doc = loadDoc(state.data, { clientId });
      },
      type(blockId, text) {
        edit(blockId, text);
        clock.runDeferred();
      },
      send: edit,
      typeMany(blockId, count) {
        for (let i = 1; i <= count; i++) {
          edit(blockId, "x");
          if (i % 500 === 0) clock.runDeferred();
        }
        clock.runDeferred();
      },
      leave() {
        service.receive(peer, { type: "UNSUBSCRIBE", docId: DOC, generation });
        clock.runDeferred();
      },
      blocks: () => canonicalBlocksOf(scriptBody(replica()).materialize()),
    };
  };

  /** Lets every queued commit run, and every promise waiting on one settle. */
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 50; i++) {
      clock.runDeferred();
      await Promise.resolve();
    }
  };
  const run = async <T>(answer: Promise<T>): Promise<T> => {
    await settle();
    return answer;
  };
  const versions = async (): Promise<VersionItem[]> => {
    const list = await run(history.list("sam", DOC, null, 500));
    if (!list.ok) throw new RangeError(`the list was refused: ${list.code}`);
    return list.value.versions;
  };
  const named = (name: string, n: number) =>
    run(
      history.name("sam", {
        docId: DOC,
        key: key(n),
        name,
        fromVersionId: null,
      }),
    );
  const blocksOf = async (versionId: string): Promise<BlockJSON[]> => {
    const opened = await run(history.content("sam", DOC, { versionId }));
    if (!opened.ok) throw new RangeError(`not opened: ${opened.code}`);
    return opened.value.content.blocks;
  };
  return {
    clock,
    storage,
    file,
    service,
    history,
    sam: person(fakePeer(), 1001),
    dana: person(fakePeer({ userId: "dana", name: "Dana Reyes" }), 2002),
    settle,
    run,
    versions,
    named,
    blocksOf,
  };
}

/** The CONTROL frames `peer` was sent since it last took, their data read as JSON. */
function controls(peer: FakePeer): unknown[] {
  return peer
    .take()
    .flatMap((m: Message) =>
      m.type === "CONTROL"
        ? [{ kind: m.kind, data: JSON.parse(new TextDecoder().decode(m.data)) }]
        : [],
    );
}

function valueOf<T>(outcome: HistoryOutcome<T>): T {
  if (!outcome.ok) throw new RangeError(`refused: ${outcome.code}`);
  return outcome.value;
}

test("a session that changed the script leaves an automatic version at its head, with who and how much", async () => {
  const { sam, dana, settle, named, history } = historyWorld();
  await named("First draft", 1);
  sam.join();
  dana.join();
  sam.type(SCENE_2_ACTION, "cold ");
  dana.type(SCENE_5_ACTION, "x");
  sam.leave();
  // Dana goes on after Sam has left, so her own session has something new
  dana.type(SCENE_5_ACTION, "y");
  dana.leave();
  await settle();
  const list = await history.list("sam", DOC, null, 500);
  expect(list).toMatchObject({
    ok: true,
    value: {
      versions: [
        {
          kind: "auto",
          createdByUserId: "dana",
          position: { generation: 1, seq: 4 },
          summary: { authorUserIds: ["dana"], changes: 1, scenes: 1 },
        },
        {
          kind: "auto",
          createdByUserId: "sam",
          position: { generation: 1, seq: 3 },
          summary: { authorUserIds: ["sam", "dana"], changes: 2, scenes: 2 },
        },
        { kind: "named", name: "First draft" },
      ],
      next: null,
      othersCanOpen: true,
    },
  });
});

test("a session that changed nothing leaves no version", async () => {
  const { sam, settle, versions, named, run, history } = historyWorld();
  await named("First draft", 1);
  sam.join();
  sam.leave();
  await settle();
  expect((await versions()).map((v) => v.kind)).toEqual(["named"]);
  // nothing new since its last version either: the head is not past it
  sam.join();
  sam.type(SCENE_2_ACTION, "cold ");
  await run(history.save("sam", { docId: DOC, key: key(2), kind: "saved" }));
  sam.leave();
  await settle();
  expect((await versions()).map((v) => v.kind)).toEqual(["saved", "named"]);
});

test("naming Working pins its content and tells every editor", async () => {
  const { sam, dana, file, run, history, blocksOf } = historyWorld();
  sam.join();
  dana.join();
  sam.type(SCENE_2_ACTION, "cold ");
  dana.peer.take();
  const answer = await run(
    history.name("sam", {
      docId: DOC,
      key: key(1),
      name: "  Table read draft ",
      fromVersionId: null,
    }),
  );
  const { version } = valueOf(answer);
  expect(version).toMatchObject({
    kind: "named",
    name: "Table read draft",
    createdByUserId: "sam",
    createdAt: T0,
    onDevice: false,
    position: { generation: 1, seq: 2 },
    engineVersion: 0,
  });
  expect(file.history.snapshotOf(version.id)).toEqual({
    ref: expect.stringMatching(/^[0-9a-f]{64}$/),
    engineVersion: 0,
  });
  expect(controls(dana.peer)).toEqual([
    {
      kind: "draft_named",
      data: {
        kind: "draft_named",
        versionId: version.id,
        userId: "sam",
        at: T0,
        name: "Table read draft",
        versionAt: T0,
        scene: null,
        beforeVersionId: null,
      },
    },
  ]);
  expect(await blocksOf(version.id)).toEqual(sam.blocks());
  for (const name of ["   ", "x".repeat(121)])
    expect(
      await run(
        history.name("sam", {
          docId: DOC,
          key: key(2),
          name,
          fromVersionId: null,
        }),
      ),
    ).toEqual({ ok: false, code: "bad_request" });
});

test("naming a listed version gives it a name, and a retried name is applied once", async () => {
  const { sam, settle, versions, named, run, history, blocksOf } =
    historyWorld();
  await named("First draft", 1);
  sam.join();
  sam.type(SCENE_2_ACTION, "cold ");
  sam.leave();
  await settle();
  const [session] = await versions();
  if (session === undefined) throw new RangeError("no session version");
  const body = {
    docId: DOC,
    key: key(2),
    name: "Studio draft",
    fromVersionId: session.id,
  };
  const first = await run(history.name("sam", body));
  expect(first).toMatchObject({
    ok: true,
    value: {
      version: {
        kind: "named",
        name: "Studio draft",
        position: session.position,
      },
    },
  });
  const { version } = valueOf(first);
  expect(await blocksOf(version.id)).toEqual(await blocksOf(session.id));
  expect(await run(history.name("sam", body))).toEqual(first);
  expect(await run(history.name("dana", body))).toEqual({
    ok: false,
    code: "bad_request",
  });
  expect(
    (await versions()).filter((v) => v.name === "Studio draft").length,
  ).toBe(1);
  expect(
    await run(
      history.name("sam", { ...body, key: key(3), fromVersionId: "gone" }),
    ),
  ).toEqual({ ok: false, code: "not_found" });
});

test("Mark a version makes a Saved version at the head", async () => {
  const { sam, dana, run, history } = historyWorld();
  sam.join();
  dana.join();
  sam.type(SCENE_2_ACTION, "cold ");
  dana.peer.take();
  const body = { docId: DOC, key: key(1), kind: "saved" } as const;
  const { version } = valueOf(await run(history.save("sam", body)));
  expect(version).toMatchObject({
    kind: "saved",
    name: null,
    createdByUserId: "sam",
    position: { generation: 1, seq: 2 },
  });
  expect(controls(dana.peer)).toEqual([
    {
      kind: "version_created",
      data: {
        kind: "version_created",
        versionId: version.id,
        userId: "sam",
        at: T0,
        name: null,
        versionAt: T0,
        scene: null,
        beforeVersionId: null,
      },
    },
  ]);
  expect(valueOf(await run(history.save("sam", body)))).toEqual({ version });
});

/** A version of the script made on Sam's device. */
function deviceVersion(id: string, blocks: unknown[] = SCRIPT_BLOCKS) {
  // a block this build refuses can only be built as JSON of the wrong shape
  const content: DocJSON = JSON.parse(
    JSON.stringify({
      type: "doc",
      content: [{ type: "section", content: blocks }],
    }),
  );
  return {
    docId: DOC,
    version: {
      id,
      kind: "device" as const,
      name: null,
      deviceId: "device-9",
      content,
      schemaVersion: 1,
    },
  };
}

test("a device version uploads once, keeps its kind, and takes the server's time", async () => {
  const { clock, file, run, history, blocksOf } = historyWorld();
  clock.advance(5_000);
  const body = deviceVersion("device-version-1");
  const first = await run(history.upload("sam", body));
  expect(first).toMatchObject({
    ok: true,
    value: {
      version: {
        id: "device-version-1",
        kind: "device",
        createdByUserId: "sam",
        createdAt: T0 + 5_000,
        onDevice: true,
        position: null,
        summary: { authorUserIds: ["sam"], changes: 12, scenes: 6 },
      },
    },
  });
  clock.advance(5_000);
  expect(await run(history.upload("sam", body))).toEqual(first);
  expect(
    file.versions.list(DOC).filter((v) => v.id === "device-version-1"),
  ).toEqual([
    {
      id: "device-version-1",
      docId: DOC,
      generation: null,
      seq: null,
      kind: "device",
      name: null,
      createdByUserId: "sam",
      createdAt: T0 + 5_000,
      deviceId: "device-9",
    },
  ]);
  expect(await blocksOf("device-version-1")).toEqual(
    canonicalBlocksOf(body.version.content),
  );
});

test("an upload holding a block this build refuses is not stored", async () => {
  const { file, run, history } = historyWorld();
  const image = {
    type: "block",
    attrs: { id: "image-block-1", type: "action" },
    content: [{ type: "img" }],
  };
  const body = deviceVersion("device-version-2", [image]);
  expect(await run(history.upload("sam", body))).toEqual({
    ok: false,
    code: "invalid",
  });
  expect(file.history.get("device-version-2")).toBeNull();
});

test("thousands of versions are listed a page at a time", async () => {
  const { file, history } = historyWorld();
  file.transaction(() => {
    for (let i = 0; i < 5_000; i++)
      file.versions.add({
        id: `bulk-${String(i).padStart(4, "0")}`,
        docId: DOC,
        generation: 1,
        seq: 1,
        kind: "auto",
        name: null,
        createdByUserId: "sam",
        createdAt: T0 - i * 1_000,
        deviceId: null,
      });
  });
  const pages: number[] = [];
  const seen = new Set<string>();
  let cursor: VersionCursor | null = null;
  for (;;) {
    const page: VersionListResponse = valueOf(
      await history.list("sam", DOC, cursor, 500),
    );
    const { versions, next } = page;
    pages.push(versions.length);
    for (const v of versions) seen.add(v.id);
    if (next === null) break;
    expect(isVersionCursor(next)).toBe(true);
    const [createdAt, id]: string[] = next.split(":");
    cursor = { createdAt: Number(createdAt), id: id ?? "" };
  }
  expect(pages).toEqual(Array.from({ length: 10 }, () => 500));
  expect(seen.size).toBe(5_000);
});

test("versions on both sides of a rebuild are listed and open", async () => {
  const world = historyWorld();
  const { sam, dana, clock, service, settle, versions, named, blocksOf } =
    world;
  await named("First draft", 1);
  sam.join();
  dana.join();
  sam.type(SCENE_2_ACTION, "cold ");
  const before = sam.blocks();
  sam.leave();
  await settle();
  service.requestRebuild(DOC);
  clock.advance(10_000);
  expect(world.file.log.get(DOC)?.generation).toBe(2);
  dana.join();
  dana.type(SCENE_5_ACTION, "x");
  dana.leave();
  await settle();
  const listed = await versions();
  expect(listed).toMatchObject([
    { kind: "auto", createdByUserId: "dana", position: { generation: 2 } },
    {
      kind: "auto",
      createdByUserId: "sam",
      position: { generation: 1, seq: 2 },
    },
    { kind: "named", name: "First draft" },
  ]);
  expect(await blocksOf(listed[1]!.id)).toEqual(before);
  expect(await blocksOf(listed[0]!.id)).toEqual(dana.blocks());
});

test("a log version is pinned for its first day and kept as a snapshot after", async () => {
  const { sam, dana, clock, file, history, settle, versions, named, blocksOf } =
    historyWorld();
  await named("First draft", 1);
  sam.join();
  // auto version at seq 1,500; 10,000 more updates (checkpoints prune); advance one day; maintain()
  sam.typeMany(SCENE_2_ACTION, 1_499);
  const blocksAtSeq = sam.blocks();
  sam.leave();
  await settle();
  const [v] = await versions();
  expect(v?.position).toEqual({ generation: 1, seq: 1_500 });
  expect(file.history.snapshotOf(v!.id)).toBeNull();
  // an hour later, so that Dana's version does not thin Sam's away
  clock.advance(3_600_000);
  dana.join();
  dana.typeMany(SCENE_5_ACTION, 10_000);
  dana.leave();
  await settle();
  // the checkpoints after it were pruned to the newest three; the one its pin needs was kept
  expect(file.checkpoints.atOrBefore(DOC, 1, 5_000)?.seq).toBe(1_500);
  clock.advance(DAY_MS);
  history.maintain(DOC);
  expect(file.history.snapshotOf(v!.id)).not.toBeNull();
  expect(await blocksOf(v!.id)).toEqual(blocksAtSeq);
});

test("a purged generation's versions still open", async () => {
  const { sam, dana, clock, file, service, history, settle, named, versions } =
    historyWorld();
  await named("First draft", 1);
  sam.join();
  dana.join();
  sam.type(SCENE_2_ACTION, "cold ");
  const before = sam.blocks();
  sam.leave();
  await settle();
  const [v] = await versions();
  service.requestRebuild(DOC);
  clock.advance(10_000);
  expect(file.log.get(DOC)?.generation).toBe(2);
  // freeze, advance 90 days + 1 ms, maintain
  clock.advance(7_776_000_000 + 1);
  history.maintain(DOC);
  expect(file.generations.get(DOC, 1)?.finalState).toBeNull();
  expect(file.log.tail(DOC, 1, 0).rows).toEqual([]);
  const opened = valueOf(
    await history.content("sam", DOC, { versionId: v!.id }),
  );
  expect(opened).toEqual({
    content: expect.objectContaining({ blocks: before }),
    position: { generation: 1, seq: 2 },
  });
});

test("a thinned version's changes join the version kept after it", async () => {
  const { sam, dana, clock, history, settle, named, versions } = historyWorld();
  await named("First draft", 1);
  sam.join();
  sam.type(SCENE_2_ACTION, "cold ");
  sam.leave();
  await settle();
  clock.advance(5 * 60_000);
  dana.join();
  dana.type(SCENE_5_ACTION, "x");
  dana.leave();
  await settle();
  expect((await versions()).length).toBe(3);
  clock.advance(2 * DAY_MS);
  history.maintain(DOC);
  expect(await versions()).toMatchObject([
    {
      kind: "auto",
      createdByUserId: "dana",
      summary: { authorUserIds: ["dana", "sam"], changes: 2, scenes: 2 },
    },
    { kind: "named", name: "First draft" },
  ]);
});

test("a reader may list and open versions but not name, save or upload", async () => {
  const { run, history, named } = historyWorld();
  const { version } = valueOf(await named("First draft", 1));
  expect(await run(history.list("leo", DOC, null, 500))).toMatchObject({
    ok: true,
    value: { versions: [{ id: version.id }], othersCanOpen: true },
  });
  expect(
    await run(history.content("leo", DOC, { versionId: version.id })),
  ).toMatchObject({ ok: true, value: { position: { generation: 1, seq: 1 } } });
  const refused = { ok: false, code: "forbidden" } as const;
  expect(
    await run(
      history.name("leo", {
        docId: DOC,
        key: key(2),
        name: "Mine",
        fromVersionId: null,
      }),
    ),
  ).toEqual(refused);
  expect(
    await run(history.save("leo", { docId: DOC, key: key(3), kind: "saved" })),
  ).toEqual(refused);
  expect(await run(history.upload("leo", deviceVersion("leo-1")))).toEqual(
    refused,
  );
  expect(await run(history.list("ana", DOC, null, 500))).toEqual(refused);
});

/** A named version another feature keeps at a position of the script. */
const keptRow = (id: string, seq: number, createdAt: number): VersionRow => ({
  id,
  docId: DOC,
  generation: 1,
  seq,
  kind: "named",
  name: "White production draft",
  createdByUserId: "sam",
  createdAt,
  deviceId: null,
});

test("a version another feature keeps inside its own write is listed with its snapshot and its locks", async () => {
  const extras: HistoryExtras = {
    locksAt: () => [ANCHOR],
    authority: () => () => null,
  };
  const { sam, storage, file, clock, history, versions, blocksOf, run } =
    historyWorld({ extras });
  sam.join();
  sam.type(SCENE_2_ACTION, "cold ");
  const row = keptRow("white-draft", 2, clock.clock.now());
  file.transaction(() => history.keep(file, row));
  expect(await versions()).toMatchObject([
    { id: "white-draft", kind: "named", name: "White production draft" },
  ]);
  expect(file.history.snapshotOf("white-draft")).not.toBeNull();
  const opened = valueOf(
    await run(history.content("sam", DOC, { versionId: "white-draft" })),
  );
  expect(opened.content.locks).toEqual([ANCHOR]);
  expect(await blocksOf("white-draft")).toEqual(sam.blocks());
  storage.failNextCommit();
  expect(() =>
    file.transaction(() => history.keep(file, { ...row, id: "white-2" })),
  ).toThrow(StorageError);
  expect(file.history.get("white-2")).toBeNull();
});

/** Removes `versionId`'s snapshot manifest: the version no longer reads. */
function damageSnapshot(file: DocFile, versionId: string): void {
  const snapshot = file.history.snapshotOf(versionId);
  if (snapshot === null) throw new RangeError(`${versionId} has no snapshot`);
  file.history.removeChunks([Uint8Array.fromHex(snapshot.ref)]);
}

test("a session's version is refused when the version before it is damaged, and the push queued beside it commits", async () => {
  const { sam, dana, clock, file, service, settle, versions, named } =
    historyWorld();
  const { version } = valueOf(await named("First draft", 1));
  // nobody holds the room: it is unloaded and forgotten, and what was kept of it with it
  clock.advance(30_000);
  damageSnapshot(file, version.id);
  sam.join();
  dana.join();
  sam.type(SCENE_2_ACTION, "cold ");
  dana.peer.take();
  dana.send(SCENE_5_ACTION, "x");
  sam.leave();
  await settle();
  expect(service.stats().poisoned).toBe(0);
  expect(file.log.get(DOC)?.headSeq).toBe(3);
  expect(dana.peer.take().filter((m) => m.type === "ERROR")).toEqual([]);
  expect((await versions()).map((v) => v.kind)).toEqual(["named"]);
});

test("an upload to a script nobody has open is read again for the version after it", async () => {
  const { sam, file, settle, run, history, versions } = historyWorld();
  const upload = deviceVersion("device-version-4");
  valueOf(await run(history.upload("sam", upload)));
  damageSnapshot(file, "device-version-4");
  sam.join();
  sam.type(SCENE_2_ACTION, "cold ");
  sam.leave();
  await settle();
  expect((await versions()).map((v) => v.kind)).toEqual(["device"]);
});

test("a name for a listed version, or an upload, whose commit fails answers busy and keeps nothing", async () => {
  const { storage, file, run, history, versions, named } = historyWorld();
  const { version } = valueOf(await named("First draft", 1));
  storage.failNextCommit();
  const body = {
    docId: DOC,
    key: key(2),
    name: "Studio draft",
    fromVersionId: version.id,
  };
  expect(await run(history.name("sam", body))).toEqual({
    ok: false,
    code: "busy",
  });
  storage.failNextCommit();
  expect(
    await run(history.upload("sam", deviceVersion("device-version-3"))),
  ).toEqual({ ok: false, code: "busy" });
  expect(file.history.get("device-version-3")).toBeNull();
  expect((await versions()).map((v) => v.name)).toEqual(["First draft"]);
});

test("a version another feature keeps is kept when the version before it is damaged", async () => {
  const { file, clock, history, versions, named } = historyWorld();
  const { version } = valueOf(await named("First draft", 1));
  clock.advance(30_000);
  damageSnapshot(file, version.id);
  const row = keptRow("white-draft", 1, clock.clock.now());
  file.transaction(() => history.keep(file, row));
  expect((await versions()).map((v) => v.id)).toEqual([
    "white-draft",
    version.id,
  ]);
});

test("a session's version is refused when another version is kept before its turn", async () => {
  const { sam, file, clock, service, history, settle, versions } =
    historyWorld();
  sam.join();
  sam.type(SCENE_2_ACTION, "cold ");
  // the session ends, and its version waits for its turn in the write queue
  service.receive(sam.peer, { type: "UNSUBSCRIBE", docId: DOC, generation: 1 });
  // kept at the seeded script, so the session's change is new since it
  const row = keptRow("white-draft", 1, clock.clock.now());
  file.transaction(() => history.keep(file, row));
  await settle();
  expect((await versions()).map((v) => v.id)).toEqual(["white-draft"]);
});
