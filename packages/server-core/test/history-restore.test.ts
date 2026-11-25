import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  loadDoc,
  scriptBody,
  scriptDocFromJSON,
  scriptSettings,
} from "@manent/crdt";
import type { CrdtDoc, TransactionReport } from "@manent/crdt";
import { canonicalBlocksOf } from "@manent/revisions";
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import type {
  Message,
  RestoreRequest,
  VersionSet,
} from "@manent/sync-protocol";
import {
  contentAt,
  createHistoryService,
  createSyncService,
} from "../src/index.ts";
import type { HistoryOutcome, SyncService } from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import type { FakePeer } from "../src/testing/index.ts";
import { DOC, HOME, PROJECT, appendAll } from "./seed.ts";
import { EMPTY_VECTOR, subscribe } from "./service-world.ts";

const T0 = 1_811_808_000_000;
const V1: VersionSet = { protocol: 1, schema: 1, engine: 0, table: 0 };
const OPEN_LIMITS = {
  framesPerSecond: 1e9,
  frameBurst: 1e9,
  bytesPerSecond: 1e12,
  byteBurst: 1e12,
};
const heading = (scene: number): string => `scene-heading-${scene}`;
const action = (scene: number): string => `scene-action-${scene}`;
const A = action(1);
const B = action(2);
const X = action(3);
const X_NEW = "scene-action-new";
const SAM_MARK_A = "sam was here";
const key = (n: number): string => n.toString(16).padStart(32, "0");

/** Three scenes, each a heading and an action; the second heading numbered and the third omitted. */
const SCRIPT_BLOCKS: BlockJSON[] = [1, 2, 3].flatMap((scene) => [
  {
    type: "block" as const,
    attrs: {
      id: heading(scene),
      type: "scene_heading",
      ...(scene === 2 ? { num: "4A" } : {}),
      ...(scene === 3 ? { omitted: true } : {}),
    },
    content: [{ type: "text" as const, text: `INT. FERRY ${scene}` }],
  },
  {
    type: "block" as const,
    attrs: { id: action(scene), type: "action" },
    content: [{ type: "text" as const, text: `Gulls ${scene}.` }],
  },
]);

/** The text of each block, in order. */
type Texts = [string, string][];

const textsOf = (blocks: readonly BlockJSON[]): Texts =>
  blocks.map((block) => [
    String(block.attrs?.id),
    (block.content ?? []).map((run) => run.text).join(""),
  ]);

/** A message as a person received it. */
type Received = Message | { type: "CONTROL"; kind: string; data: unknown };

/** One person's device: a replica taken from the server when it joins, and the edits it pushes. */
interface Person {
  readonly peer: FakePeer;
  join(): void;
  /** Appends `text` to the block. */
  type(blockId: string, text: string): void;
  deleteBlock(blockId: string): void;
  insertBlock(after: string, blockId: string, text: string): void;
  /** Writes on the replica now; the push is sent when the returned function is called. */
  later(blockId: string, text: string): () => void;
  /** Pushes an edit and leaves it queued, not yet committed. */
  queuePush(blockId: string, text: string): void;
  /** What the server sent since the last call, CONTROL data read as JSON. */
  received(): Received[];
}

function restoreWorld(options: { seed?: BlockJSON[] } = {}) {
  const clock = fakeClock(T0);
  const storage = createMemoryStorage({ now: () => clock.clock.now() });
  let made = 0;
  const ids = (): string => `version-${String(++made).padStart(5, "0")}`;
  const sync: { service: SyncService | null } = { service: null };
  const history = createHistoryService({
    sync: () => {
      if (sync.service === null) throw new RangeError("no service yet");
      return sync.service;
    },
    storage,
    clock: clock.clock,
    ids,
  });
  const reports: (TransactionReport | null)[] = [];
  const service = createSyncService({
    storage,
    clock: clock.clock,
    defer: clock.defer,
    ids,
    versions: { current: V1, min: V1 },
    limits: OPEN_LIMITS,
    hooks: [history, { committed: ({ report }) => reports.push(report) }],
  });
  sync.service = service;
  service.access.create("sam", {
    docId: DOC,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  storage.directory.setRole(DOC, "dana", "edit", []);
  storage.directory.setRole(DOC, "leo", "view", []);
  const script: DocJSON = {
    type: "doc",
    content: [{ type: "section", content: options.seed ?? SCRIPT_BLOCKS }],
  };
  const seed = scriptDocFromJSON(script, { clientId: 9001 });
  appendAll(storage, [seed.encodeState()], { userId: "sam" });
  const file = storage.open(HOME);

  const person = (peer: FakePeer, clientId: number): Person => {
    service.attach(peer);
    let doc: CrdtDoc | null = null;
    let clientSeq = 0;
    const write = (
      edit: Parameters<ReturnType<typeof scriptBody>["write"]>[0],
    ): (() => void) => {
      if (doc === null) throw new RangeError(`${peer.userId} has not joined`);
      const sent: Uint8Array[] = [];
      const stop = doc.subscribe((update) => sent.push(update));
      scriptBody(doc).write(edit);
      stop();
      return () => {
        for (const update of sent)
          service.receive(peer, {
            type: "PUSH",
            docId: DOC,
            generation: 1,
            clientSeq: ++clientSeq,
            update,
            heal: false,
          });
      };
    };
    const append = (blockId: string, text: string): (() => void) =>
      write((w) => {
        const block = canonicalBlocksOf(scriptBody(doc!).materialize()).find(
          (b) => b.attrs?.id === blockId,
        );
        const at = textsOf(block === undefined ? [] : [block])[0]?.[1] ?? "";
        w.insertText(blockId, at.length, text);
      });
    return {
      peer,
      join() {
        service.receive(peer, subscribe(DOC, "edit", [clientId]));
        service.receive(peer, {
          type: "SYNC",
          docId: DOC,
          generation: 1,
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
        append(blockId, text)();
        clock.runDeferred();
      },
      deleteBlock(blockId) {
        write((w) => w.deleteBlock(blockId))();
        clock.runDeferred();
      },
      insertBlock(after, blockId, text) {
        const block = {
          type: "block" as const,
          attrs: { id: blockId, type: "action" },
          content: [{ type: "text" as const, text }],
        };
        write((w) => w.insertBlocks(after, [block]))();
        clock.runDeferred();
      },
      later: append,
      queuePush: (blockId, text) => append(blockId, text)(),
      received: () =>
        peer
          .take()
          .map((m: Message): Received =>
            m.type === "CONTROL"
              ? { ...m, data: JSON.parse(new TextDecoder().decode(m.data)) }
              : m,
          ),
    };
  };

  /** Lets every queued commit run, and every promise waiting on one settle. */
  const run = async <T>(answer: Promise<T>): Promise<T> => {
    for (let i = 0; i < 50; i++) {
      clock.runDeferred();
      await Promise.resolve();
    }
    return answer;
  };
  const head = (): number => file.log.get(DOC)?.headSeq ?? 0;
  const roomBlocks = (): BlockJSON[] =>
    contentAt(file, DOC, { generation: 1, seq: head() })?.blocks ?? [];
  const named = async (name: string, n: number): Promise<string> => {
    const body = { docId: DOC, key: key(n), name, fromVersionId: null };
    return valueOf(await run(history.name("sam", body))).version.id;
  };
  const blocksOf = async (versionId: string): Promise<BlockJSON[]> =>
    valueOf(await run(history.content("sam", DOC, { versionId }))).content
      .blocks;
  const restore = (
    userId: string,
    versionId: string,
    n: number,
    scope: RestoreRequest["scope"] = { kind: "script" },
  ) =>
    run(
      history.restore(userId, {
        docId: DOC,
        key: key(n),
        versionId,
        scope,
        clientId: null,
      }),
    );
  return {
    clock,
    storage,
    file,
    history,
    reports,
    sam: person(fakePeer(), 1001),
    dana: person(fakePeer({ userId: "dana", name: "Dana Reyes" }), 2002),
    run,
    head,
    roomBlocks,
    roomText: (): Texts => textsOf(roomBlocks()),
    named,
    blocksOf,
    textOf: async (versionId: string): Promise<Texts> =>
      textsOf(await blocksOf(versionId)),
    restore,
    versionsNewestFirst: () => file.history.page(DOC, null, 500),
    tail: () => file.log.tail(DOC, 1, 1).rows,
  };
}

function valueOf<T>(outcome: HistoryOutcome<T>): T {
  if (!outcome.ok) throw new RangeError(`refused: ${outcome.code}`);
  return outcome.value;
}

test("a restore is a forward change after a Before restore version", async () => {
  const world = restoreWorld();
  const { sam, dana, history, run } = world;
  sam.join();
  dana.join();
  const v = await world.named("Table read draft", 1);
  dana.type(A, " later");
  dana.deleteBlock(B);
  const headBefore = world.head();
  sam.received();
  const out = await run(
    history.restore("dana", {
      docId: DOC,
      key: key(2),
      versionId: v,
      scope: { kind: "script" },
      clientId: null,
    }),
  );
  expect(out).toMatchObject({ ok: true, value: { applied: 2 } });
  expect(world.roomText()).toEqual(await world.textOf(v));
  const tail = world.tail();
  expect(tail.map((row) => row.origin)).toEqual(["edit", "edit", "restore"]);
  expect(tail.at(-1)?.userId).toBe("dana");
  expect(
    world
      .versionsNewestFirst()
      .slice(0, 1)
      .map((x) => [x.kind, x.seq]),
  ).toEqual([["pre_restore", headBefore]]);
  expect(sam.received()).toMatchObject([
    { type: "SYNC" },
    {
      type: "CONTROL",
      kind: "restored",
      data: {
        userId: "dana",
        name: "Table read draft",
        scene: null,
        beforeVersionId: valueOf(out).beforeVersionId,
      },
    },
  ]);
});

test("restoring one scene leaves every other scene as it is", async () => {
  const world = restoreWorld();
  const { dana } = world;
  dana.join();
  const v = await world.named("Table read draft", 1);
  dana.type(A, " later");
  dana.type(B, " colder");
  dana.deleteBlock(X);
  const out = await world.restore("dana", v, 2, {
    kind: "scene",
    headingId: heading(2),
  });
  expect(out).toMatchObject({ ok: true, value: { applied: 1 } });
  expect(world.roomText()).toEqual([
    [heading(1), "INT. FERRY 1"],
    [A, "Gulls 1. later"],
    [heading(2), "INT. FERRY 2"],
    [B, "Gulls 2."],
    [heading(3), "INT. FERRY 3"],
  ]);
  const [before] = world.versionsNewestFirst();
  expect(before?.kind).toBe("pre_restore");
  const told = dana
    .received()
    .filter((m) => m.type === "CONTROL" && m.kind === "restored");
  expect(told).toMatchObject([
    { kind: "restored", data: { scene: "4A", beforeVersionId: before?.id } },
  ]);
});

test("a scene the version lacks cannot be restored", async () => {
  const world = restoreWorld();
  const { dana } = world;
  dana.join();
  const v = await world.named("Table read draft", 1);
  dana.type(A, " later");
  const head = world.head();
  const versions = world.versionsNewestFirst().length;
  expect(
    await world.restore("dana", v, 2, {
      kind: "scene",
      headingId: "scene-heading-9",
    }),
  ).toEqual({ ok: false, code: "not_restorable" });
  expect(world.head()).toBe(head);
  expect(world.versionsNewestFirst().length).toBe(versions);
});

test("a restore never changes scene numbers, omitted scenes, settings, notes or comments", async () => {
  const world = restoreWorld();
  const { dana, file, history, run } = world;
  dana.join();
  const settingsBefore = scriptSettings(
    loadDoc(file.log.tail(DOC, 1, 0).rows[0]!.update),
  ).entries();
  // a device's version that numbers and omits scenes otherwise, with other text
  const blocks = SCRIPT_BLOCKS.map((block) => ({
    ...block,
    attrs: { ...block.attrs, num: "99", omitted: false },
    content: [{ type: "text" as const, text: "Rain." }],
  }));
  const content: DocJSON = {
    type: "doc",
    content: [{ type: "section", content: blocks }],
  };
  const version = { id: "device-version-1", kind: "device" as const };
  const upload = { ...version, name: null, deviceId: "device-9", content };
  valueOf(
    await run(
      history.upload("dana", {
        docId: DOC,
        version: { ...upload, schemaVersion: 1 },
      }),
    ),
  );
  world.reports.length = 0;
  valueOf(await world.restore("dana", "device-version-1", 1));
  const numbers = world
    .roomBlocks()
    .map((block) => [
      block.attrs?.id,
      block.attrs?.num ?? null,
      block.attrs?.omitted ?? false,
      block.content?.[0]?.text,
    ]);
  expect(numbers).toEqual(
    SCRIPT_BLOCKS.map((block) => [
      block.attrs?.id,
      block.attrs?.num ?? null,
      block.attrs?.omitted ?? false,
      "Rain.",
    ]),
  );
  const at = { generation: 1, seq: world.head() };
  expect(contentAt(file, DOC, at)?.settings).toEqual(settingsBefore);
  expect(world.reports.map((report) => report?.maps)).toEqual([[]]);
});

test("a restore is planned against every push queued before it", async () => {
  const world = restoreWorld();
  const { sam, history, run } = world;
  sam.join();
  const v = await world.named("Table read draft", 1);
  sam.queuePush(A, "x");
  await run(
    history.restore("dana", {
      docId: DOC,
      key: key(2),
      versionId: v,
      scope: { kind: "script" },
      clientId: null,
    }),
  );
  const roomTextOf = (id: string) => world.roomText().find(([at]) => at === id);
  const textOf = async (versionId: string, id: string) =>
    (await world.textOf(versionId)).find(([at]) => at === id);
  expect(roomTextOf(A)).toEqual(await textOf(v, A));
  expect(world.tail().map((row) => [row.origin, row.userId])).toEqual([
    ["edit", "sam"],
    ["restore", "dana"],
  ]);
});

test("a later edit in a block the restore kept survives it", async () => {
  const world = restoreWorld();
  const { sam, dana, run } = world;
  sam.join();
  dana.join();
  dana.type(A, " wet");
  const v = await world.named("Table read draft", 1);
  dana.type(A, " later");
  dana.insertBlock(A, X_NEW, "Gone soon.");
  // Sam's replica was made before the restore; his push arrives after it
  const send = sam.later(A, SAM_MARK_A);
  valueOf(await world.restore("dana", v, 2));
  send();
  await run(Promise.resolve());
  const roomTextOf = (id: string) =>
    world.roomText().find(([at]) => at === id)?.[1];
  expect(roomTextOf(A)).toContain(SAM_MARK_A);
});

test("two restores of different versions apply in order and keep both Before restore versions", async () => {
  const world = restoreWorld();
  const { dana } = world;
  dana.join();
  const v1 = await world.named("Table read draft", 1);
  dana.type(A, " later");
  const v2 = await world.named("Studio draft", 2);
  dana.type(B, " colder");
  const [r1, r2] = await Promise.all([
    world.restore("dana", v1, 3),
    world.restore("sam", v2, 4),
  ]);
  expect(r1.ok).toBe(true);
  expect(world.roomText()).toEqual(await world.textOf(v2));
  const kinds = world.versionsNewestFirst().map((version) => version.kind);
  expect(kinds.filter((k) => k === "pre_restore")).toHaveLength(2);
  expect(await world.textOf(valueOf(r2).beforeVersionId)).toEqual(
    await world.textOf(v1),
  );
});

test("a restore retried under its key applies nothing twice, also while the first is still being written", async () => {
  const world = restoreWorld();
  const { dana, history, run } = world;
  dana.join();
  const v = await world.named("Table read draft", 1);
  dana.type(A, " later");
  const body = {
    docId: DOC,
    key: key(2),
    versionId: v,
    scope: { kind: "script" },
    clientId: null,
  } as const;
  // the retry is sent before the first commits
  const first = history.restore("dana", body);
  const retry = history.restore("dana", body);
  const [a, b] = await Promise.all([run(first), run(retry)]);
  expect(b).toEqual(a);
  expect(world.tail().filter((row) => row.origin === "restore")).toHaveLength(
    1,
  );
  expect(await run(history.restore("dana", body))).toEqual(a);
  expect(await run(history.restore("sam", body))).toEqual({
    ok: false,
    code: "bad_request",
  });
});

test("restoring Before restore puts the script back", async () => {
  const world = restoreWorld();
  const { dana } = world;
  dana.join();
  const v = await world.named("Table read draft", 1);
  dana.type(A, " later");
  dana.deleteBlock(B);
  const before = world.roomText();
  const { beforeVersionId } = valueOf(await world.restore("dana", v, 2));
  expect(world.roomText()).toEqual(await world.textOf(v));
  const back = valueOf(await world.restore("dana", beforeVersionId, 3));
  expect(world.roomText()).toEqual(before);
  expect(back.beforeVersionId).not.toBe(beforeVersionId);
  const kinds = world.versionsNewestFirst().map((version) => version.kind);
  expect(kinds.filter((k) => k === "pre_restore")).toHaveLength(2);
});

/** A block written by a newer build: an attribute this one does not know. */
const GLOWING = {
  type: "block" as const,
  attrs: { id: "glow-block-1", type: "action", glow: 3 },
  content: [{ type: "text" as const, text: "It hums." }],
};

test("what a newer build wrote survives a restore", async () => {
  const glowing = GLOWING;
  const world = restoreWorld({ seed: [...SCRIPT_BLOCKS, glowing] });
  const { dana } = world;
  dana.join();
  const v = await world.named("Table read draft", 1);
  dana.type(A, " later");
  valueOf(await world.restore("dana", v, 2));
  expect(world.roomBlocks().at(-1)).toEqual(canonicalBlock(glowing));
  expect(world.roomText()).toEqual(await world.textOf(v));
});

test("a reader cannot restore", async () => {
  const world = restoreWorld();
  const v = await world.named("Table read draft", 1);
  expect(await world.restore("leo", v, 2)).toEqual({
    ok: false,
    code: "forbidden",
  });
});

test("a restore that would write a block this build cannot hold as it is writes nothing", async () => {
  const world = restoreWorld();
  const { history, run } = world;
  // a newer build's device kept a version holding a block this build does not know all of
  const content: DocJSON = {
    type: "doc",
    content: [{ type: "section", content: [...SCRIPT_BLOCKS, GLOWING] }],
  };
  const version = {
    id: "device-version-2",
    kind: "device" as const,
    name: null,
    deviceId: "device-9",
    content,
    schemaVersion: 2,
  };
  valueOf(await run(history.upload("dana", { docId: DOC, version })));
  const head = world.head();
  const versions = world.versionsNewestFirst().length;
  expect(await world.restore("dana", version.id, 2)).toEqual({
    ok: false,
    code: "invalid",
  });
  expect(world.head()).toBe(head);
  expect(world.versionsNewestFirst().length).toBe(versions);
});

test("a restore whose commit fails answers busy and keeps nothing", async () => {
  const world = restoreWorld();
  const { dana, storage, file } = world;
  dana.join();
  const v = await world.named("Table read draft", 1);
  dana.type(A, " later");
  const head = world.head();
  storage.failNextCommit();
  expect(await world.restore("dana", v, 2)).toEqual({
    ok: false,
    code: "busy",
  });
  expect(world.head()).toBe(head);
  const kinds = world.versionsNewestFirst().map((version) => version.kind);
  expect(kinds.filter((kind) => kind === "pre_restore")).toEqual([]);
  expect(file.history.request(DOC, key(2))).toBeNull();
});

test("a Before restore version is summarised against a version kept just before its commit", async () => {
  const world = restoreWorld();
  const { dana, file, clock, history, run } = world;
  dana.join();
  const v = await world.named("Table read draft", 1);
  dana.type(A, " later");
  const body = {
    docId: DOC,
    key: key(2),
    versionId: v,
    scope: { kind: "script" },
    clientId: null,
  } as const;
  // the restore is queued; another feature keeps the head as a version before it commits
  const restored = history.restore("dana", body);
  const kept = {
    id: "white-draft",
    docId: DOC,
    generation: 1,
    seq: world.head(),
    kind: "named" as const,
    name: "White production draft",
    createdByUserId: "sam",
    createdAt: clock.clock.now(),
    deviceId: null,
  };
  file.transaction(() => history.keep(file, kept));
  const { beforeVersionId } = valueOf(await run(restored));
  expect(file.history.summary(beforeVersionId)).toEqual({
    authorIds: [],
    blockIds: [],
    sceneIds: [],
  });
});

/** Stored answers: what this service writes, near misses of it, and any JSON at all. */
const storedAnswers = fc.oneof(
  fc.record({
    beforeVersionId: fc.oneof(fc.constant("version-00009"), fc.integer()),
    serverSeq: fc.oneof(fc.nat(), fc.constant(-1), fc.constant("3")),
    applied: fc.oneof(fc.nat(), fc.constant(1.5), fc.constant(null)),
  }),
  fc.json().map((text) => JSON.parse(text)),
);

test("a retry is answered as stored only when the stored answer reads as one", async () => {
  const world = restoreWorld();
  const { file, history } = world;
  const v = await world.named("Table read draft", 1);
  let n = 100;
  await fc.assert(
    fc.asyncProperty(storedAnswers, async (stored) => {
      const at = key(++n);
      file.history.putRequest({
        docId: DOC,
        key: at,
        userId: "dana",
        result: JSON.stringify(stored),
        createdAt: T0,
      });
      const body = {
        docId: DOC,
        key: at,
        versionId: v,
        scope: { kind: "script" },
        clientId: null,
      } as const;
      const answer = await history.restore("dana", body);
      const valid =
        typeof stored?.beforeVersionId === "string" &&
        Number.isSafeInteger(stored.serverSeq) &&
        stored.serverSeq >= 0 &&
        Number.isSafeInteger(stored.applied) &&
        stored.applied >= 0;
      expect(answer).toEqual(
        valid
          ? {
              ok: true,
              value: {
                beforeVersionId: stored.beforeVersionId,
                serverSeq: stored.serverSeq,
                applied: stored.applied,
              },
            }
          : { ok: false, code: "bad_request" },
      );
    }),
    { numRuns: 200 },
  );
});
