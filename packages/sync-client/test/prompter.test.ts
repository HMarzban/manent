import { expect, test } from "bun:test";
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import {
  CODE,
  FRAME_LIMIT_BYTES,
  MESSAGE_LIMIT_BYTES,
  createFrameDecoder,
  createFrameEncoder,
  createMessageIds,
} from "@manent/sync-protocol";
import type {
  Message,
  PrompterFeed,
  PrompterPatch,
  PrompterRow,
} from "@manent/sync-protocol";
import { readBlocks } from "../src/index.ts";
import type { LeaderPort } from "../src/index.ts";
import {
  createFakeClock,
  createMemoryNetwork,
  createMemoryStoreSpace,
} from "../src/testing/index.ts";
import type { ServerEnd } from "../src/testing/index.ts";
import { DOC, block, setup, subscribed, utf8, v } from "./scripted-server.ts";

const RUNDOWN = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cf";
const B_CHAR = "block-char-00001";
const B_DIAL = "block-dial-00002";
const B_NEW = "block-new-000003";

const dialogue = (id: string, text: string): BlockJSON =>
  canonicalBlock({
    type: "block",
    attrs: { id, type: "dialogue" },
    content: [{ type: "text", text }],
  });

const row = (
  rowId: string,
  number: number | null,
  title: string,
  storyId: string | null = `script-${rowId}`,
): PrompterRow => ({
  rowId,
  kind: storyId === null ? "header" : "story",
  number,
  title,
  storyId,
  durationMs: storyId === null ? null : 45_000,
});

const HEARTBEAT: PrompterPatch = {
  v: 1,
  runOrder: null,
  stories: [],
  removed: [],
};

const turn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

interface PrompterPeer {
  readonly end: ServerEnd;
  readonly received: Message[];
  send(message: Message): void;
  snapshot(docId: string, feed: PrompterFeed, generation?: number): void;
  patch(docId: string, patch: unknown, generation?: number): void;
}

interface PrompterWorld {
  fake: ReturnType<typeof createFakeClock>;
  network: ReturnType<typeof createMemoryNetwork>;
  peers: PrompterPeer[];
  answer: { hello: boolean; ping: boolean };
  autoFeed: PrompterFeed | null;
  settle(): Promise<void>;
  lastPeer(): PrompterPeer;
  makeClient(overrides?: {
    leader?: LeaderPort;
  }): ReturnType<Awaited<ReturnType<typeof setup>>["makeClient"]>;
  store: ReturnType<ReturnType<typeof createMemoryStoreSpace>["store"]>;
}

async function createPrompterWorld(
  initialFeed: PrompterFeed | null = null,
): Promise<PrompterWorld> {
  const base = await setup();
  const peers: PrompterPeer[] = [];
  const answer = { hello: true, ping: true };
  const world: PrompterWorld = {
    fake: base.fake,
    network: base.network,
    peers,
    answer,
    autoFeed: initialFeed,
    store: base.store,
    settle: () => base.settle(),
    lastPeer() {
      const peer = peers.at(-1);
      if (peer === undefined) throw new RangeError("no peer connected");
      return peer;
    },
    makeClient: (overrides) => base.makeClient(overrides),
  };

  base.network.serve({
    connected(end) {
      const decoder = createFrameDecoder({ from: "client" });
      const encoder = createFrameEncoder({ ids: createMessageIds() });
      const send = (message: Message): void => {
        for (const frame of encoder.encode(message)) end.send(frame);
      };
      const peer: PrompterPeer = {
        end,
        received: [],
        send,
        snapshot(docId, feed, generation = 1) {
          send(subscribed(docId, 1, generation));
          send({
            type: "VIEW_SNAPSHOT",
            docId,
            generation,
            viewSeq: 1,
            content: utf8(JSON.stringify(feed)),
          });
        },
        patch(docId, payload, generation = 1) {
          send({
            type: "VIEW_PATCH",
            docId,
            generation,
            viewSeq: 2,
            patch: utf8(JSON.stringify(payload)),
          });
        },
      };
      peers.push(peer);
      end.onFrame = (frame) => {
        const result = decoder.push(frame);
        if (result.kind !== "message") return;
        const message = result.message;
        peer.received.push(message);
        if (message.type === "HELLO" && answer.hello) {
          send({
            type: "WELCOME",
            session: { userId: end.userId, name: end.userId },
            limits: {
              frameBytes: FRAME_LIMIT_BYTES,
              messageBytes: MESSAGE_LIMIT_BYTES,
            },
            server: { current: v(1, 2, 1, 1), min: v(1, 2, 1, 1) },
          });
        } else if (message.type === "PING" && answer.ping) {
          send({ type: "PONG", nonce: message.nonce });
        } else if (
          message.type === "SUBSCRIBE" &&
          message.mode === "prompter" &&
          world.autoFeed !== null
        ) {
          peer.snapshot(
            message.docId,
            world.autoFeed,
            Math.max(message.generation, 1),
          );
        }
      };
    },
    createDocument: () => ({ ok: true }),
  });

  return world;
}

function followerOnlyLeader(tabId: string): LeaderPort {
  return {
    tabId,
    campaign: () => () => {},
    post() {},
    listen: () => () => {},
  };
}

test("readBlocks is exported from sync-client", () => {
  const valid = [block(B_CHAR, "MAREN")];
  expect(readBlocks(valid)).toEqual(valid);
  expect(readBlocks([{ type: "section" }])).toBeNull();
});

test("a prompter handle subscribes in prompter mode, loads the snapshot, and applies patches atomically", async () => {
  const row1 = row("row-1", 1, "Cold open");
  const row2 = row("row-2", 2, "Monologue");
  const header = row("hdr-1", null, "ACT ONE", null);
  const feed: PrompterFeed = {
    v: 1,
    runOrder: [header, row1, row2],
    stories: [
      { storyId: "row-1", blocks: [dialogue(B_CHAR, "Good evening.")] },
      { storyId: "row-2", blocks: [dialogue(B_DIAL, "Welcome back.")] },
    ],
  };
  const w = await createPrompterWorld(feed);
  w.fake.advance(1_000);
  const client = w.makeClient({ leader: followerOnlyLeader("tab-prompter") });
  const handle = client.prompter(RUNDOWN);
  expect(handle.status.get()).toEqual({
    feed: "waiting",
    lastReceivedAt: null,
  });

  await w.settle();

  expect(w.lastPeer().received.filter((m) => m.type === "SUBSCRIBE")).toEqual([
    {
      type: "SUBSCRIBE",
      docId: RUNDOWN,
      generation: 0,
      mode: "prompter",
      clientIds: [],
      lastServerSeq: 0,
    },
  ]);
  expect(handle.runOrder.get()).toEqual([header, row1, row2]);
  expect(handle.stories.get()).toEqual(
    new Map<string, readonly BlockJSON[]>([
      ["row-1", [dialogue(B_CHAR, "Good evening.")]],
      ["row-2", [dialogue(B_DIAL, "Welcome back.")]],
    ]),
  );
  expect(handle.status.get()).toEqual({ feed: "live", lastReceivedAt: 1_000 });
  expect(await w.store.load(RUNDOWN)).toBeNull();
  expect(w.lastPeer().received.filter((m) => m.type === "SYNC")).toEqual([]);
  expect(w.lastPeer().received.filter((m) => m.type === "AWARENESS")).toEqual(
    [],
  );

  // when a patch updates both runOrder and stories, a runOrder listener sees the new stories at once
  const observedStories: ReadonlyMap<string, readonly BlockJSON[]>[] = [];
  let runOrderNotifies = 0;
  let storyNotifies = 0;
  handle.runOrder.subscribe(() => {
    runOrderNotifies += 1;
    observedStories.push(handle.stories.get());
  });
  handle.stories.subscribe(() => {
    storyNotifies += 1;
  });

  w.fake.advance(1_000);
  const updated: PrompterPatch = {
    v: 1,
    runOrder: [header, row2],
    stories: [{ storyId: "row-2", blocks: [dialogue(B_NEW, "Updated line.")] }],
    removed: ["row-1"],
  };
  w.lastPeer().patch(RUNDOWN, updated);
  await w.settle();

  expect(handle.runOrder.get()).toEqual([header, row2]);
  expect(handle.stories.get()).toEqual(
    new Map<string, readonly BlockJSON[]>([
      ["row-2", [dialogue(B_NEW, "Updated line.")]],
    ]),
  );
  expect(observedStories).toEqual([
    new Map<string, readonly BlockJSON[]>([
      ["row-2", [dialogue(B_NEW, "Updated line.")]],
    ]),
  ]);
  expect([runOrderNotifies, storyNotifies]).toEqual([1, 1]);
  expect(handle.status.get()).toEqual({ feed: "live", lastReceivedAt: 2_000 });

  // a heartbeat patch updates lastReceivedAt without notifying runOrder or stories
  w.fake.advance(1_000);
  w.lastPeer().patch(RUNDOWN, HEARTBEAT);
  await w.settle();
  expect([runOrderNotifies, storyNotifies]).toEqual([1, 1]);
  expect(handle.status.get()).toEqual({ feed: "live", lastReceivedAt: 3_000 });

  handle.close();
  await client.close();
});

test("a prompter handle runs on its own socket outside the tab lead and edit sessions", async () => {
  const base = await setup();
  const client = base.makeClient();
  const edit = await client.open(DOC);
  await base.online();
  expect(base.connects()).toBe(1);
  expect(edit.status.get().docSync).toBe("synced");

  const prompter = client.prompter(DOC);
  await base.settle();
  expect(base.connects()).toBe(2);

  prompter.close();
  await base.settle();
  expect(base.closes()).toBe(1);
  expect(edit.status.get().docSync).toBe("synced");

  // a non-leader tab still gets a live prompter feed on its own socket
  const w = await createPrompterWorld({
    v: 1,
    runOrder: [row("row-1", 1, "Top")],
    stories: [{ storyId: "row-1", blocks: [dialogue(B_CHAR, "Live.")] }],
  });
  const follower = w.makeClient({ leader: followerOnlyLeader("tab-2") });
  expect(follower.link.get().leader).toBe(false);
  const followerFeed = follower.prompter(RUNDOWN);
  await w.settle();
  expect(follower.link.get().leader).toBe(false);
  expect(followerFeed.status.get()).toEqual({
    feed: "live",
    lastReceivedAt: 0,
  });
  expect(followerFeed.runOrder.get()).toEqual([row("row-1", 1, "Top")]);

  followerFeed.close();
  await follower.close();
  await edit.close();
  await client.close();
});

test("the feed reads lost 3 s after the last frame, stays live on 1 s heartbeats, and recovers without reload", async () => {
  const initial: PrompterFeed = {
    v: 1,
    runOrder: [row("row-1", 1, "Opening")],
    stories: [{ storyId: "row-1", blocks: [dialogue(B_CHAR, "First line.")] }],
  };
  const w = await createPrompterWorld(initial);
  w.fake.advance(5_000);
  const client = w.makeClient({ leader: followerOnlyLeader("tab-1") });
  const handle = client.prompter(RUNDOWN);
  await w.settle();
  expect(handle.status.get()).toEqual({ feed: "live", lastReceivedAt: 5_000 });

  // heartbeats every 1 s keep the feed live
  for (let i = 1; i <= 4; i++) {
    w.fake.advance(1_000);
    w.lastPeer().patch(RUNDOWN, HEARTBEAT);
    await w.settle();
    expect(handle.status.get()).toEqual({
      feed: "live",
      lastReceivedAt: 5_000 + i * 1_000,
    });
  }

  // 2,999 ms after the last frame (at 9,000), the feed is still live
  w.fake.advance(2_999);
  await w.settle();
  expect(handle.status.get()).toEqual({ feed: "live", lastReceivedAt: 9_000 });

  // at 3,000 ms after the last frame, the feed reads lost while keeping last received text
  w.fake.advance(1);
  await w.settle();
  expect(handle.status.get()).toEqual({ feed: "lost", lastReceivedAt: 9_000 });
  expect(handle.stories.get()).toEqual(
    new Map<string, readonly BlockJSON[]>([
      ["row-1", [dialogue(B_CHAR, "First line.")]],
    ]),
  );

  // if a frame arrives again on the open socket, live returns immediately
  w.fake.advance(500);
  w.lastPeer().patch(RUNDOWN, HEARTBEAT);
  await w.settle();
  expect(handle.status.get()).toEqual({ feed: "live", lastReceivedAt: 12_500 });

  // if the socket is silently dead (no frames and no PONG), the probe replaces it and reconnects
  w.answer.ping = false;
  const fresh: PrompterFeed = {
    v: 1,
    runOrder: [row("row-1", 1, "Opening")],
    stories: [{ storyId: "row-1", blocks: [dialogue(B_NEW, "Fresh line.")] }],
  };
  w.autoFeed = fresh;
  const peersBefore = w.peers.length;
  w.fake.advance(3_000);
  await w.settle();
  expect(handle.status.get()).toEqual({ feed: "lost", lastReceivedAt: 12_500 });
  w.fake.advance(1_500);
  await w.settle();
  w.fake.advance(5_000);
  await w.settle();
  expect(w.peers.length).toBeGreaterThan(peersBefore);
  expect(handle.status.get().feed).toBe("live");
  expect(handle.stories.get()).toEqual(
    new Map<string, readonly BlockJSON[]>([
      ["row-1", [dialogue(B_NEW, "Fresh line.")]],
    ]),
  );

  handle.close();
  await client.close();
});

test("the feed reads lost at once when the connection drops and takes a fresh snapshot on reconnect", async () => {
  const first: PrompterFeed = {
    v: 1,
    runOrder: [row("row-1", 1, "First")],
    stories: [{ storyId: "row-1", blocks: [dialogue(B_CHAR, "Before drop.")] }],
  };
  const w = await createPrompterWorld(first);
  w.fake.advance(2_000);
  const client = w.makeClient({ leader: followerOnlyLeader("tab-1") });
  const handle = client.prompter(RUNDOWN);
  await w.settle();
  expect(handle.status.get()).toEqual({ feed: "live", lastReceivedAt: 2_000 });

  // drop the connection at t = 2,100: feed reads lost immediately without waiting 3 s
  w.fake.advance(100);
  w.network.partition(true);
  await w.settle();
  expect(handle.status.get()).toEqual({ feed: "lost", lastReceivedAt: 2_000 });
  expect(handle.runOrder.get()).toEqual([row("row-1", 1, "First")]);
  expect(handle.stories.get()).toEqual(
    new Map<string, readonly BlockJSON[]>([
      ["row-1", [dialogue(B_CHAR, "Before drop.")]],
    ]),
  );

  // server comes back with a new snapshot: handle reconnects, subscribes again, and shows the fresh snapshot
  w.autoFeed = {
    v: 1,
    runOrder: [row("row-2", 1, "Second")],
    stories: [{ storyId: "row-2", blocks: [dialogue(B_NEW, "After drop.")] }],
  };
  w.network.partition(false);
  w.fake.advance(30_000);
  await w.settle();

  expect(handle.status.get()).toEqual({
    feed: "live",
    lastReceivedAt: w.fake.clock.now(),
  });
  expect(handle.runOrder.get()).toEqual([row("row-2", 1, "Second")]);
  expect(handle.stories.get()).toEqual(
    new Map<string, readonly BlockJSON[]>([
      ["row-2", [dialogue(B_NEW, "After drop.")]],
    ]),
  );

  handle.close();
  await client.close();
});

test("the feed reads refused on ERROR 4403 or 4410 and does not reconnect", async () => {
  for (const code of [CODE.FORBIDDEN, CODE.DOCUMENT_DELETED] as const) {
    const w = await createPrompterWorld(null);
    const client = w.makeClient({ leader: followerOnlyLeader("tab-1") });
    const handle = client.prompter(RUNDOWN);
    await w.settle();

    const peersBefore = w.peers.length;
    w.lastPeer().send({
      type: "ERROR",
      code,
      message: code === CODE.FORBIDDEN ? "prompter_unavailable" : "deleted",
      retryAfterMs: null,
      permanent: false,
      doc: { docId: RUNDOWN, generation: 1 },
      clientSeq: null,
    });
    await w.settle();

    expect(handle.status.get()).toEqual({
      feed: "refused",
      lastReceivedAt: null,
    });

    // advancing the clock does not reconnect or re-subscribe
    w.fake.advance(60_000);
    await w.settle();
    expect(w.peers.length).toBe(peersBefore);
    expect(handle.status.get()).toEqual({
      feed: "refused",
      lastReceivedAt: null,
    });

    handle.close();
    await client.close();
  }
});

test("a malformed payload never corrupts the feed and subscribes again from a snapshot", async () => {
  const feed: PrompterFeed = {
    v: 1,
    runOrder: [row("row-1", 1, "Intro")],
    stories: [{ storyId: "row-1", blocks: [dialogue(B_CHAR, "Keep me.")] }],
  };
  const w = await createPrompterWorld(feed);
  const client = w.makeClient({ leader: followerOnlyLeader("tab-1") });
  const handle = client.prompter(RUNDOWN);
  await w.settle();
  w.autoFeed = null;

  const badPayloads: unknown[] = [
    { v: 2, runOrder: null, stories: [], removed: [] },
    { v: 1, runOrder: [{ rowId: 7 }], stories: [], removed: [] },
    {
      v: 1,
      runOrder: null,
      stories: [{ storyId: "row-1", blocks: [{ type: "section" }] }],
      removed: [],
    },
    { v: 1, runOrder: null, stories: [], removed: [42] },
  ];

  for (const [index, bad] of badPayloads.entries()) {
    w.lastPeer().patch(RUNDOWN, bad);
    await w.settle();
    expect(handle.stories.get()).toEqual(
      new Map<string, readonly BlockJSON[]>([
        ["row-1", [dialogue(B_CHAR, "Keep me.")]],
      ]),
    );
    expect(
      w.lastPeer().received.filter((m) => m.type === "SUBSCRIBE").length,
    ).toBe(index + 2);
    w.lastPeer().snapshot(RUNDOWN, feed);
    await w.settle();
  }

  // unknown future keys on a valid patch are ignored
  w.fake.advance(500);
  w.lastPeer().patch(RUNDOWN, {
    v: 1,
    runOrder: [{ ...row("row-1", 1, "Intro"), futureField: true }],
    stories: [
      {
        storyId: "row-1",
        blocks: [dialogue(B_NEW, "Extra key ok.")],
        futureField: 123,
      },
    ],
    removed: [],
    futureField: "ignored",
  });
  await w.settle();
  expect(handle.stories.get()).toEqual(
    new Map<string, readonly BlockJSON[]>([
      ["row-1", [dialogue(B_NEW, "Extra key ok.")]],
    ]),
  );

  // generation move subscribes to the new generation
  w.lastPeer().send({
    type: "GENERATION_MOVED",
    docId: RUNDOWN,
    generation: 1,
    newGeneration: 2,
  });
  await w.settle();
  expect(
    w
      .lastPeer()
      .received.filter((m) => m.type === "SUBSCRIBE")
      .at(-1),
  ).toEqual({
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 2,
    mode: "prompter",
    clientIds: [],
    lastServerSeq: 0,
  });

  // closing sends UNSUBSCRIBE and is idempotent
  handle.close();
  handle.close();
  await turn();
  await w.settle();
  expect(w.lastPeer().received.filter((m) => m.type === "UNSUBSCRIBE")).toEqual(
    [{ type: "UNSUBSCRIBE", docId: RUNDOWN, generation: 2 }],
  );
  await client.close();
});
