import { expect, test } from "bun:test";
import {
  applyInspecting,
  createDoc,
  jsonMap,
  readCommentThreads,
  startThread,
} from "@manent/crdt";
import { createMemoryStorage } from "@manent/storage/testing";
import { commentsDocId } from "@manent/sync-protocol";
import {
  DEFAULT_LIMITS,
  createDocumentAccess,
  validateRoomPush,
} from "../src/index.ts";
import { admit } from "../src/sync/admission.ts";
import { mayEdit } from "../src/sync/subscribe.ts";
import { fakePeer } from "../src/testing/index.ts";
import { createWorld } from "./write-world.ts";

test("a commenter who rewrites another person's thread to name themselves is refused", () => {
  const sam = createDoc({ clientId: 1 });
  startThread(
    sam,
    {
      threadId: "thread-1",
      itemId: "item-1",
      anchor: null,
      roundId: null,
      authorUserId: "sam",
      body: "Cut this line.",
      mentionedUserIds: [],
    },
    () => 1_000,
  );
  const server = createDoc({ clientId: 2 });
  server.applyUpdate(sam.encodeState());
  const leo = createDoc({ clientId: 3 });
  leo.applyUpdate(server.encodeState());
  const since = leo.encodeStateVector();
  const stored = readCommentThreads(leo)["thread-1"];
  jsonMap(leo, "threads").set("thread-1", { ...stored, authorUserId: "leo" });
  const report = applyInspecting(server, leo.diff(since));
  if (report === null) throw new RangeError("the rewrite changed nothing");
  const room = {
    ...createWorld().room,
    kind: "comments" as const,
    doc: server,
  };
  const subscription = {
    peer: fakePeer({ userId: "leo" }),
    mode: "edit" as const,
    access: { role: "comment" as const, capabilities: [] },
    stalled: false,
  };
  expect(validateRoomPush({ report, room, subscription })).toEqual([
    {
      path: "threads.thread-1",
      code: "unknown_node",
      severity: "reject",
      message: "a push changed the author or the time of the thread thread-1",
    },
  ]);
});

test("comment role subscribes and writes on comments docs only, and view never writes", () => {
  expect([
    mayEdit("comments", "owner"),
    mayEdit("comments", "edit"),
    mayEdit("comments", "comment"),
    mayEdit("comments", "view"),
    mayEdit("script", "comment"),
    mayEdit("index", "comment"),
  ]).toEqual([true, true, true, false, false, true]);

  const world = createWorld();
  const ports = {
    limits: DEFAULT_LIMITS,
    bucketOf: () => ({
      frames: { take: () => ({ ok: true as const }) },
      bytes: { take: () => ({ ok: true as const }) },
    }),
  };
  const msg = { clientSeq: 1, generation: world.room.row.generation };
  expect(
    admit(
      ports,
      { ...world.room, kind: "comments" },
      {
        peer: fakePeer({ userId: "leo" }),
        mode: "edit",
        access: { role: "comment", capabilities: [] },
        stalled: false,
      },
      msg,
      16,
    ),
  ).toBeNull();
  expect(
    admit(
      ports,
      { ...world.room, kind: "comments" },
      {
        peer: fakePeer({ userId: "leo" }),
        mode: "edit",
        access: { role: "view", capabilities: [] },
        stalled: false,
      },
      msg,
      16,
    )?.message,
  ).toBe("read_only_role");
  expect(
    admit(
      ports,
      { ...world.room, kind: "index" },
      {
        peer: fakePeer({ userId: "leo" }),
        mode: "edit",
        access: { role: "comment", capabilities: [] },
        stalled: false,
      },
      msg,
      16,
    )?.message,
  ).toBe("read_only_role");
  expect(
    admit(
      ports,
      { ...world.room, kind: "script" },
      {
        peer: fakePeer({ userId: "leo" }),
        mode: "edit",
        access: { role: "comment", capabilities: [] },
        stalled: false,
      },
      msg,
      16,
    )?.message,
  ).toBe("read_only_role");
});

test("draftReaders grants comment on comments doc when scriptRole refuses or returns view", () => {
  const storage = createMemoryStorage({ now: () => 1_000 });
  const scriptId = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
  const cId = commentsDocId(scriptId);
  const home = {
    kind: "project" as const,
    id: "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5",
  };
  const versions = {
    current: { protocol: 1, schema: 1, engine: 0, table: 0 },
    min: { protocol: 1, schema: 1, engine: 0, table: 0 },
  };
  const access = createDocumentAccess({
    storage,
    versions,
    draftReaders: {
      isDraftReader: (userId, docId) => userId === "leo" && docId === scriptId,
    },
  });
  access.create("sam", {
    docId: scriptId,
    kind: "script",
    home: `project:${home.id}`,
  });
  access.create("sam", {
    docId: cId,
    kind: "comments",
    home: `project:${home.id}`,
    scriptDocId: scriptId,
  });
  storage.directory.setRole(scriptId, "priya", "view", []);
  storage.directory.setRole(scriptId, "dana", "edit", []);

  // Leo has no script role, but is a draft reader -> comment on comments doc, still forbidden on script
  expect(access.resolve("leo", cId)).toMatchObject({
    ok: true,
    access: { role: "comment", capabilities: [] },
  });
  expect(access.resolve("leo", scriptId)).toEqual({
    ok: false,
    code: "forbidden",
  });
  // Upgrade from view when also a draft reader
  storage.directory.setRole(scriptId, "leo", "view", []);
  expect(access.resolve("leo", cId)).toMatchObject({
    ok: true,
    access: { role: "comment", capabilities: [] },
  });
  // Priya has view and is NOT a draft reader -> stays view read-only
  expect(access.resolve("priya", cId)).toMatchObject({
    ok: true,
    access: { role: "view", capabilities: [] },
  });
  // Dana has edit -> keeps edit
  expect(access.resolve("dana", cId)).toMatchObject({
    ok: true,
    access: { role: "edit", capabilities: [] },
  });
});
