import { expect, test } from "bun:test";
import { scriptSettings } from "@manent/crdt";
import type { SettingRules } from "../src/index.ts";
import { BLOCK, DOC, createTypist } from "./seed.ts";
import {
  ALICE_CLIENT,
  createWorld,
  pushOf,
  restartOn,
  setOf,
  textOf,
} from "./write-world.ts";
import type { WriteWorld } from "./write-world.ts";

const REGISTRY: SettingRules = {
  check(key, value) {
    if (key === "script.paper")
      return value === "letter" || value === "a4"
        ? { ok: true }
        : { ok: false, code: "bad_value" };
    if (key === "script.moresAtBreaks")
      return typeof value === "boolean"
        ? { ok: true }
        : { ok: false, code: "bad_value" };
    return { ok: false, code: "unknown_key" };
  },
  isGuarded: (key) => key === "script.paper",
};

const world = (): WriteWorld => createWorld({ registry: REGISTRY });

test("the authority writes a setting itself, acknowledges it, and tells every editor, the sender included", () => {
  const { path, room, subA, clock, events } = world();
  path.set(room, subA, setOf(4, "script.paper", "a4"));
  clock.runDeferred();
  expect(scriptSettings(room.doc!).entries()).toEqual({
    "script.paper": "a4",
  });
  expect(scriptSettings(room.doc!).meta("script.paper")).toEqual({
    userId: "sam",
    setAt: clock.clock.now(),
    replaced: null,
  });
  // the sender holds the value before its overlay drops
  expect(
    events.map((e) => [e.type, e.type === "publish" ? e.echo : null]),
  ).toEqual([
    ["commit", null],
    ["publish", true],
    ["ack", null],
  ]);
  expect(
    room.file.log.tail(DOC, 1, 0).rows.map((r) => [r.origin, r.userId]),
  ).toEqual([["system", "sam"]]);
  expect(room.file.log.lastSetRequest(DOC, "sam", "device-1")).toBe(4);
});

test("a setting sent again after a lost acknowledgement is acknowledged and written once", () => {
  const { path, room, subA, subB, clock, events, storage } = world();
  path.set(room, subA, setOf(4, "script.paper", "a4"));
  clock.runDeferred();
  // dana changes it after sam
  path.set(room, subB, setOf(1, "script.paper", "letter"));
  clock.runDeferred();
  // sam's resends
  path.set(room, subA, setOf(4, "script.paper", "a4"));
  path.set(room, subA, setOf(4, "script.paper", "a4"));
  clock.runDeferred();
  // dana's change stands
  expect(scriptSettings(room.doc!).entries()).toEqual({
    "script.paper": "letter",
  });
  expect(
    events.flatMap((e) =>
      e.type === "ack" && e.peer === subA.peer ? [e.clientSeq] : [],
    ),
  ).toEqual([4, 4, 4]);
  // two settings stored, no resend
  expect(room.file.log.tail(DOC, 1, 0).rows).toHaveLength(2);
  // also after a restart
  const after = restartOn(storage, { registry: REGISTRY });
  after.path.set(after.room, after.subA, setOf(4, "script.paper", "a4"));
  after.clock.runDeferred();
  expect(after.room.file.log.tail(DOC, 1, 0).rows).toHaveLength(2);
  expect(after.newAcks()).toEqual([4]);
});

test("a second request from one device in the same turn is a resend", () => {
  const { path, room, subA, clock, events } = world();
  path.set(room, subA, setOf(4, "script.paper", "a4"));
  path.set(room, subA, setOf(4, "script.paper", "letter"));
  clock.runDeferred();
  expect(scriptSettings(room.doc!).entries()).toEqual({
    "script.paper": "a4",
  });
  expect(events.map((e) => e.type)).toEqual([
    "commit",
    "publish",
    "ack",
    "ack",
  ]);
});

test("a refused setting names its entry, refuses nothing else and takes no text with it", () => {
  const { path, room, subA, clock, events, refusals } = world();
  const typist = createTypist(ALICE_CLIENT);
  path.push(room, subA, pushOf(1, typist.insertBlock(BLOCK, null, "kept")));
  path.set(room, subA, setOf(2, "script.paper", "legal"));
  path.set(room, subA, setOf(3, "glow", 1));
  path.set(room, subA, {
    ...setOf(4, "script.paper", "a4"),
    value: new Uint8Array([123]),
  });
  path.push(room, subA, pushOf(5, typist.type(BLOCK, " also kept")));
  clock.runDeferred();
  expect(refusals).toEqual([
    {
      code: 4423,
      message: "bad_value",
      permanent: false,
      retryAfterMs: null,
      clientSeq: 2,
    },
    {
      code: 4423,
      message: "unknown_key",
      permanent: false,
      retryAfterMs: null,
      clientSeq: 3,
    },
    {
      code: 4423,
      message: "bad_value",
      permanent: false,
      retryAfterMs: null,
      clientSeq: 4,
    },
  ]);
  expect(
    events.flatMap((e) => (e.type === "ack" ? [e.clientSeq] : [])),
  ).toEqual([1, 5]);
  expect(subA.stalled).toBe(false);
  expect(textOf(room)).toContain("kept");
  expect(scriptSettings(room.doc!).entries()).toEqual({});
});

test("a guarded setting is refused once page numbers are locked", () => {
  const { path, room, subA, clock, refusals } = world();
  room.row = { ...room.row, locked: 1 };
  path.set(room, subA, setOf(1, "script.paper", "a4"));
  path.set(room, subA, setOf(2, "script.moresAtBreaks", false));
  clock.runDeferred();
  expect(refusals).toEqual([
    {
      code: 4423,
      message: "locked",
      permanent: false,
      retryAfterMs: null,
      clientSeq: 1,
    },
  ]);
  expect(scriptSettings(room.doc!).entries()).toEqual({
    "script.moresAtBreaks": false,
  });
});

test("a setting from a viewer, or for another generation, is refused without naming an entry", () => {
  const { path, room, subA, subViewer, clock, refusals } = world();
  path.set(room, subViewer, setOf(1, "script.paper", "a4"));
  path.set(room, subA, { ...setOf(2, "script.paper", "a4"), generation: 2 });
  clock.runDeferred();
  expect(refusals).toEqual([
    {
      code: 4403,
      message: "not_subscribed",
      permanent: false,
      retryAfterMs: null,
      clientSeq: null,
    },
    {
      code: 4409,
      message: "generation_moved",
      permanent: false,
      retryAfterMs: null,
      clientSeq: null,
    },
  ]);
  expect(scriptSettings(room.doc!).entries()).toEqual({});
});
