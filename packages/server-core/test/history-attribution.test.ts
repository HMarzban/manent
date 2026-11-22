import { expect, spyOn, test } from "bun:test";
import { loadDoc, scriptBody, scriptDocFromJSON } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { canonicalBlocksOf } from "@manent/revisions";
import type { BlockJSON } from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import type { VersionPosition, VersionSet } from "@manent/sync-protocol";
import {
  createHistoryService,
  createSyncService,
  lastChanges,
} from "../src/index.ts";
import type {
  BlockLastChange,
  HistoryOutcome,
  SyncService,
} from "../src/index.ts";
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
const A = "scene-action-1";
const B = "scene-action-2";
const C = "scene-action-3";
const D = "scene-action-4";
const key = (n: number): string => n.toString(16).padStart(32, "0");

/** One scene heading, then four empty actions. */
const SCRIPT_BLOCKS: BlockJSON[] = [
  {
    type: "block",
    attrs: { id: "scene-heading-1", type: "scene_heading" },
    content: [{ type: "text", text: "INT. FERRY - NIGHT" }],
  },
  ...[A, B, C, D].map((id) => ({
    type: "block" as const,
    attrs: { id, type: "action" },
  })),
];

/** One person's device: a replica taken from the server when they open the script, and the edits it pushes. */
interface Person {
  /** Opens the script; answers the position the person saw. */
  join(): VersionPosition;
  /** Appends `text` to the block. */
  type(blockId: string, text: string): void;
  /** The block's whole text becomes `text`. */
  replace(blockId: string, text: string): void;
  /** `count` one-letter edits, committed in turns of 500. */
  typeMany(blockId: string, count: number): void;
  leave(): void;
}

function attributionWorld() {
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
  for (const userId of ["dana", "priya"])
    storage.directory.setRole(DOC, userId, "edit", []);
  storage.directory.setRole(DOC, "leo", "view", []);
  const seed = scriptDocFromJSON(
    { type: "doc", content: [{ type: "section", content: SCRIPT_BLOCKS }] },
    { clientId: 9001 },
  );
  appendAll(storage, [seed.encodeState()], { userId: "sam" });
  const file = storage.open(HOME);

  const person = (peer: FakePeer, clientId: number): Person => {
    service.attach(peer);
    let doc: CrdtDoc | null = null;
    let clientSeq = 0;
    const textOf = (blockId: string): string =>
      canonicalBlocksOf(scriptBody(doc!).materialize())
        .find((block) => block.attrs?.id === blockId)
        ?.content?.map((run) => run.text)
        .join("") ?? "";
    const edit = (
      write: Parameters<ReturnType<typeof scriptBody>["write"]>[0],
    ): void => {
      if (doc === null) throw new RangeError(`${peer.userId} has not joined`);
      const sent: Uint8Array[] = [];
      const stop = doc.subscribe((update) => sent.push(update));
      scriptBody(doc).write(write);
      stop();
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
    return {
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
        return { generation: 1, seq: file.log.get(DOC)?.headSeq ?? 0 };
      },
      type(blockId, text) {
        edit((w) => w.insertText(blockId, textOf(blockId).length, text));
        clock.runDeferred();
      },
      replace(blockId, text) {
        edit((w) => {
          w.deleteText(blockId, 0, textOf(blockId).length);
          w.insertText(blockId, 0, text);
        });
        clock.runDeferred();
      },
      typeMany(blockId, count) {
        for (let i = 1; i <= count; i++) {
          edit((w) => w.insertText(blockId, 0, "x"));
          if (i % 500 === 0) clock.runDeferred();
        }
        clock.runDeferred();
      },
      leave() {
        service.receive(peer, {
          type: "UNSUBSCRIBE",
          docId: DOC,
          generation: 1,
        });
        clock.runDeferred();
      },
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
  return {
    clock,
    file,
    history,
    run,
    sam: person(fakePeer(), 1001),
    dana: person(fakePeer({ userId: "dana", name: "Dana Reyes" }), 2002),
    priya: person(fakePeer({ userId: "priya", name: "Priya Nair" }), 4004),
    named: async (name: string, n: number): Promise<string> => {
      const body = { docId: DOC, key: key(n), name, fromVersionId: null };
      return valueOf(await run(history.name("sam", body))).version.id;
    },
  };
}

function valueOf<T>(outcome: HistoryOutcome<T>): T {
  if (!outcome.ok) throw new RangeError(`refused: ${outcome.code}`);
  return outcome.value;
}

test("the last person to change a block, when, and what it said before", async () => {
  const { sam, dana, clock, history, run } = attributionWorld();
  sam.join();
  sam.type(A, "Rain.");
  dana.join();
  clock.advance(60_000);
  dana.replace(A, "Rain falls.");
  expect(await run(history.whoWrote("leo", DOC, A))).toEqual({
    ok: true,
    value: {
      userId: "dana",
      at: T0 + 60_000,
      previous: "Rain.",
      exact: true,
    },
  });
});

test("past the newest checkpoint, attribution is by version and says so", async () => {
  const { sam, dana, clock, file, history, run, named } = attributionWorld();
  await named("First draft", 1);
  sam.join();
  clock.advance(60_000);
  sam.type(A, "Rain.");
  sam.leave();
  await run(Promise.resolve());
  const [session] = file.history.page(DOC, null, 1);
  if (session === undefined) throw new RangeError("no session version");
  clock.advance(3_600_000);
  dana.join();
  dana.typeMany(B, 2_500);
  dana.leave();
  await run(Promise.resolve());
  // the newest checkpoint is past Sam's change, and a version of Dana's is between them
  expect(file.checkpoints.newest(DOC, 1)?.seq).toBe(2002);
  expect(file.history.page(DOC, null, 3).map((v) => v.createdByUserId)).toEqual(
    ["dana", "sam", "sam"],
  );
  expect(await run(history.whoWrote("leo", DOC, A))).toEqual({
    ok: true,
    value: {
      userId: "sam",
      at: session.createdAt,
      previous: "",
      exact: false,
    },
  });
});

test("changes since you last opened count other people's blocks and name them", async () => {
  const { sam, dana, priya, history, run } = attributionWorld();
  const opened = sam.join();
  dana.join();
  priya.join();
  dana.type(A, "Rain.");
  dana.type(B, "Wind.");
  priya.type(C, "Fog.");
  sam.type(D, "Sun.");
  expect(await run(history.since("sam", DOC, opened))).toEqual({
    ok: true,
    value: { changes: 3, authorUserIds: ["dana", "priya"] },
  });
});

test("each changed block is given the author of its last change", async () => {
  const { sam, dana, priya, history, run, named } = attributionWorld();
  sam.join();
  sam.type(A, "Rain.");
  const versionId = await named("Table read draft", 1);
  dana.join();
  priya.join();
  dana.type(A, " Wind.");
  priya.type(B, "Fog.");
  sam.type(C, "Sun.");
  const body = { docId: DOC, since: { versionId }, blockIds: [A, B, C, D] };
  expect(await run(history.authors("leo", body))).toEqual({
    ok: true,
    value: { authors: { [A]: "dana", [B]: "priya", [C]: "sam" } },
  });
});

test("a block nobody's history holds is not found", async () => {
  const { history, run, named } = attributionWorld();
  await named("First draft", 1);
  expect(await run(history.whoWrote("leo", DOC, "never-written-1"))).toEqual({
    ok: false,
    code: "not_found",
  });
});

test("a block unchanged since the oldest version is written by whoever that version says", async () => {
  const { dana, clock, history, run, named } = attributionWorld();
  await named("First draft", 1);
  clock.advance(3_600_000);
  dana.join();
  dana.typeMany(B, 2_500);
  dana.leave();
  expect(await run(history.whoWrote("leo", DOC, A))).toEqual({
    ok: true,
    value: { userId: "sam", at: T0, previous: null, exact: false },
  });
});

test("a block last changed before the position has no author after it", async () => {
  const { sam, priya, history, run, named } = attributionWorld();
  sam.join();
  priya.join();
  await named("First draft", 1);
  priya.type(D, "Fog.");
  const position = { generation: 1, seq: 2 };
  sam.type(A, "Rain.");
  await run(history.save("sam", { docId: DOC, key: key(2), kind: "saved" }));
  sam.type(A, " Wind.");
  await run(history.save("sam", { docId: DOC, key: key(3), kind: "saved" }));
  const body = { docId: DOC, since: { position }, blockIds: [A, D] };
  expect(await run(history.authors("leo", body))).toEqual({
    ok: true,
    value: { authors: { [A]: "sam" } },
  });
});

test("a block unchanged after a version has no author after it, though older versions changed it", async () => {
  const { sam, dana, clock, history, run, named } = attributionWorld();
  await named("First draft", 1);
  sam.join();
  sam.type(A, "Rain.");
  const saved = await run(
    history.save("sam", { docId: DOC, key: key(2), kind: "saved" }),
  );
  clock.advance(3_600_000);
  dana.join();
  dana.typeMany(B, 2_500);
  dana.leave();
  const since = { versionId: valueOf(saved).version.id };
  const body = { docId: DOC, since, blockIds: [A] };
  expect(await run(history.authors("leo", body))).toEqual({
    ok: true,
    value: { authors: {} },
  });
});

test("attribution by version reads each version once, however many blocks are asked about", async () => {
  const { sam, dana, clock, file, run, named } = attributionWorld();
  await named("First draft", 1);
  sam.join();
  clock.advance(60_000);
  for (const id of [A, B, C, D]) sam.type(id, "Rain.");
  sam.leave();
  await run(Promise.resolve());
  const [session] = file.history.page(DOC, null, 1);
  if (session === undefined) throw new RangeError("no session version");
  clock.advance(3_600_000);
  dana.join();
  dana.typeMany("scene-heading-1", 2_500);
  dana.leave();
  await run(Promise.resolve());
  const reads = spyOn(file.checkpoints, "atOrBefore");
  const changes = lastChanges(file, DOC, new Set([A, B, C, D]), null);
  const before = (id: string): BlockLastChange => ({
    userId: "sam",
    at: session.createdAt,
    previous: {
      type: "block",
      attrs: {
        id,
        type: "action",
        noContd: false,
        noTiming: false,
        omitted: false,
        synopsis: "",
      },
    },
    exact: false,
  });
  expect(Object.fromEntries(changes)).toEqual({
    [A]: before(A),
    [B]: before(B),
    [C]: before(C),
    [D]: before(D),
  });
  expect(reads).toHaveBeenCalledTimes(2);
  reads.mockRestore();
});
