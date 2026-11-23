import { expect, test } from "bun:test";
import {
  applyInspecting,
  createDoc,
  jsonMap,
  readCommentThreads,
  startThread,
} from "@manent/crdt";
import { validateRoomPush } from "../src/index.ts";
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
