import { expect, test } from "bun:test";
import { createDoc, decodeAwareness, encodeAwareness } from "@manent/crdt";
import type { AwarenessEntry } from "@manent/crdt";
import type {
  BlockPlace,
  CursorPlace,
  PresentPerson,
  RemoteCursor,
} from "@manent/editor";
import { createPresence, initialsOf } from "../src/index.ts";
import { fakeTimers, local } from "./helpers.ts";

const ME = 4;

const bp = (blockId: string, offset: number): BlockPlace => ({
  blockId,
  offset,
});

const place = (blockId: string, offset: number): CursorPlace => ({
  anchor: bp(blockId, offset),
  head: bp(blockId, offset),
  at: 0,
});

const isPlace = (value: unknown): value is CursorPlace =>
  typeof value === "object" && value !== null && "head" in value;

function cursorOf(entry: AwarenessEntry): CursorPlace {
  const cursor = entry.state?.cursor;
  if (!isPlace(cursor)) throw new RangeError("the entry carries no cursor");
  return cursor;
}

const cursorOffset = (entry: AwarenessEntry): number =>
  cursorOf(entry).head.offset;

const cursorBlock = (entry: AwarenessEntry): string =>
  cursorOf(entry).head.blockId;

const user = (userId: string, name: string, colorIndex: number) => ({
  userId,
  name,
  colorIndex,
});

/** Where awareness bytes go while nothing listens. */
const nowhere = (_update: Uint8Array): void => {};

/** A presence over a document whose awareness traffic the test sends and reads. */
function presence() {
  const timers = fakeTimers();
  let sentBytes: Uint8Array[] = [];
  let deliver = nowhere;
  const p = createPresence({
    clientId: ME,
    document: {
      ...local(createDoc()),
      sendAwareness: (update) => sentBytes.push(update),
      onAwareness: (listener) => {
        deliver = listener;
        return () => {
          deliver = nowhere;
        };
      },
    },
    timers,
  });
  const cursors: (readonly RemoteCursor[])[] = [];
  const people: (readonly PresentPerson[])[] = [];
  p.subscribe((list) => cursors.push(list));
  p.subscribePeople((list) => people.push(list));
  return {
    p,
    timers,
    cursors,
    people,
    sent: (): AwarenessEntry[] => sentBytes.flatMap(decodeAwareness),
    forget: () => {
      sentBytes = [];
    },
    receive: (entries: AwarenessEntry[]) => deliver(encodeAwareness(entries)),
    receiveBytes: (bytes: Uint8Array) => deliver(bytes),
    last: (): readonly RemoteCursor[] => cursors.at(-1) ?? [],
  };
}

test("a caret moving inside one block is sent after 200 ms of stillness, once", () => {
  const { p, timers, sent, forget } = presence();
  p.publish(place("b1", 0));
  forget();
  for (let i = 0; i < 10; i++) {
    p.publish(place("b1", i));
    timers.advance(50);
  }
  expect(sent()).toEqual([]);
  timers.advance(150);
  expect(sent().map(cursorOffset)).toEqual([9]);
  p.publish(place("b1", 9));
  timers.advance(1000);
  expect(sent()).toHaveLength(1);
});

test("moving to another block is sent at once, at most ten times a second", () => {
  const { p, timers, sent } = presence();
  p.publish(place("b1", 0));
  p.publish(place("b2", 0));
  p.publish(place("b3", 0));
  expect(sent().map(cursorBlock)).toEqual(["b1"]);
  timers.advance(100);
  expect(sent().map(cursorBlock)).toEqual(["b1", "b3"]);
});

test("a person still here is renewed every 15 seconds", () => {
  const { p, timers, sent } = presence();
  p.publish(place("b1", 2));
  timers.advance(14_999);
  const before = sent().length;
  timers.advance(1);
  expect([before, sent()]).toEqual([
    1,
    [
      { clientId: ME, clock: 1, state: { cursor: place("b1", 2) } },
      { clientId: ME, clock: 2, state: { cursor: place("b1", 2) } },
    ],
  ]);
});

test("leaving says so once", () => {
  const { p, timers, sent, forget } = presence();
  p.publish(place("b1", 2));
  p.publish(place("b2", 0));
  forget();
  p.destroy();
  p.destroy();
  expect([sent(), timers.pending()]).toEqual([
    [{ clientId: ME, clock: 2, state: null }],
    0,
  ]);
});

test("others' cursors carry the server's name and a collaborator colour", () => {
  const { receive, last } = presence();
  receive([
    {
      clientId: 7,
      clock: 1,
      state: {
        cursor: { anchor: bp("b1", 2), head: bp("b1", 2), at: 0 },
        user: { userId: "dana", name: "Dana Reyes", colorIndex: 1 },
      },
    },
  ]);
  expect(last()).toEqual([
    {
      key: "7",
      userId: "dana",
      name: "Dana Reyes",
      initials: "DR",
      colour: 2,
      place: { anchor: bp("b1", 2), head: bp("b1", 2), at: 0 },
      movedAt: 0,
    },
  ]);
});

test("at most twenty cursors, the most recently moved", () => {
  const { receive, last, timers } = presence();
  for (let id = 11; id <= 35; id++) {
    receive([
      {
        clientId: id,
        clock: 1,
        state: {
          cursor: place("b1", id),
          user: user(`u${id}`, `Person ${id}`, id % 10),
        },
      },
    ]);
    timers.advance(10);
  }
  expect(last().map((cursor) => [cursor.key, cursor.movedAt])).toEqual(
    Array.from({ length: 20 }, (_, i) => [String(16 + i), (5 + i) * 10]),
  );
});

test("my own entry, a stamp-less entry, a colour index outside 0–9 and broken bytes draw nothing", () => {
  const { receive, receiveBytes, cursors } = presence();
  receive([
    {
      clientId: ME,
      clock: 1,
      state: { cursor: place("b1", 0), user: user("you", "You", 0) },
    },
    { clientId: 8, clock: 1, state: { cursor: place("b1", 1) } },
    {
      clientId: 9,
      clock: 1,
      state: { cursor: place("b1", 2), user: user("sam", "Sam Okafor", 10) },
    },
  ]);
  receiveBytes(new Uint8Array([1, 2, 3]));
  expect(cursors).toEqual([]);
});

test("people present are listed once each, whatever their tabs, without me", () => {
  const { receive, people } = presence();
  receive([
    {
      clientId: 7,
      clock: 1,
      state: { cursor: place("b1", 0), user: user("dana", "Dana Reyes", 1) },
    },
    {
      clientId: 8,
      clock: 1,
      state: { cursor: place("b2", 0), user: user("dana", "Dana Reyes", 3) },
    },
    { clientId: 9, clock: 1, state: { user: user("sam", "Sam Okafor", 2) } },
    {
      clientId: ME,
      clock: 1,
      state: { cursor: place("b1", 0), user: user("you", "You", 0) },
    },
    {
      clientId: 5,
      clock: 1,
      state: { cursor: place("b3", 0), user: user("you", "You", 0) },
    },
  ]);
  const together = people.at(-1);
  receive([
    { clientId: 7, clock: 2, state: null },
    { clientId: 8, clock: 2, state: null },
  ]);
  expect([together, people.at(-1), people.length]).toEqual([
    [
      { userId: "dana", name: "Dana Reyes", colour: 4 },
      { userId: "sam", name: "Sam Okafor", colour: 3 },
    ],
    [{ userId: "sam", name: "Sam Okafor", colour: 3 }],
    2,
  ]);
});

test("initials", () => {
  expect(
    ["Dana Reyes", "You", "ana costa", "Priya  Nair Okafor", ""].map(
      initialsOf,
    ),
  ).toEqual(["DR", "Y", "AC", "PN", ""]);
});
