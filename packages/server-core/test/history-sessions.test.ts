import { expect, test } from "bun:test";
import { applyInspecting, createDoc } from "@manent/crdt";
import type { TransactionReport } from "@manent/crdt";
import { SYSTEM_USER_ID, createSessions } from "../src/index.ts";
import type { Committed } from "../src/index.ts";
import { fakePeer } from "../src/testing/index.ts";
import { BLOCK, createTypist } from "./seed.ts";
import { ALICE_CLIENT, createWorld } from "./write-world.ts";

const IDLE_MS = 600_000;

function typedReport(): TransactionReport {
  const report = applyInspecting(
    createDoc(),
    createTypist(ALICE_CLIENT).insertBlock(BLOCK, null, "a"),
  );
  if (report === null) throw new RangeError("the typed update changed nothing");
  return report;
}

/** A world, its sessions, and who they said ended, in order. */
function createSessionWorld() {
  const world = createWorld();
  const ended: string[] = [];
  const sessions = createSessions({
    clock: world.clock.clock,
    idleMs: IDLE_MS,
    ended: (room, userId) => {
      expect(room).toBe(world.room);
      ended.push(userId);
    },
  });
  const report = typedReport();
  const committed = (
    userId: string | null,
    made: TransactionReport | null = report,
  ): Committed => ({
    room: world.room,
    sender: userId === null ? null : fakePeer({ userId }),
    seq: 1,
    update: new Uint8Array([0, 0]),
    report: made,
    echo: false,
  });
  return { world, ended, sessions, committed };
}

test("a session ends when its person's last edit subscription ends", () => {
  const { world, ended, sessions, committed } = createSessionWorld();
  const { room, subA } = world;
  const secondTab = { ...subA, peer: fakePeer({ deviceId: "device-2" }) };
  room.editors.set(secondTab.peer, secondTab);
  sessions.committed(committed("sam"));
  room.editors.delete(subA.peer);
  sessions.editorLeft(room, "sam");
  expect(ended).toEqual([]);
  room.editors.delete(secondTab.peer);
  sessions.editorLeft(room, "sam");
  expect(ended).toEqual(["sam"]);
  world.clock.advance(IDLE_MS);
  sessions.editorLeft(room, "sam");
  expect(ended).toEqual(["sam"]);
});

test("a session ends after ten minutes without a push of that person's", () => {
  const { world, ended, sessions, committed } = createSessionWorld();
  const { clock } = world;
  sessions.committed(committed("sam"));
  clock.advance(599_999);
  sessions.committed(committed("dana"));
  clock.advance(1);
  expect(ended).toEqual(["sam"]);
  clock.advance(600_000);
  expect(ended).toEqual(["sam", "dana"]);
  // each push of theirs starts the ten minutes again
  sessions.committed(committed("sam"));
  clock.advance(599_999);
  sessions.committed(committed("sam"));
  clock.advance(1);
  expect(ended).toEqual(["sam", "dana"]);
  clock.advance(599_999);
  expect(ended).toEqual(["sam", "dana", "sam"]);
});

test("a setting or a system write starts no session", () => {
  const { world, ended, sessions, committed } = createSessionWorld();
  sessions.committed(committed("sam", null));
  sessions.committed(committed(SYSTEM_USER_ID));
  sessions.committed(committed(null));
  world.clock.advance(IDLE_MS);
  world.room.editors.clear();
  sessions.editorLeft(world.room, "sam");
  sessions.editorLeft(world.room, SYSTEM_USER_ID);
  expect(ended).toEqual([]);
});
