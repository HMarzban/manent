import { expect, test } from "bun:test";
import { createDoc, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { createCoalescer } from "../src/index.ts";
import type { Coalescer, Frames } from "../src/index.ts";
import { createFakeClock } from "../src/testing/index.ts";
import type { FakeClock } from "../src/testing/index.ts";

const BLOCK = "block-0000000001";

interface FakeFrames extends Frames {
  /** Runs every frame callback requested so far. */
  fire(): void;
  /** Frame callbacks requested and neither run nor cancelled. */
  requested(): number;
}

function fakeFrames(): FakeFrames {
  let waiting = new Set<{ fn: () => void }>();
  return {
    request(fn) {
      const entry = { fn };
      waiting.add(entry);
      return () => waiting.delete(entry);
    },
    fire() {
      const due = waiting;
      waiting = new Set();
      for (const entry of due) entry.fn();
    },
    requested: () => waiting.size,
  };
}

/** Twenty updates of one writer, each building on the one before. */
function twentyUpdates(): Uint8Array[] {
  const source = createDoc({ clientId: 7 });
  const updates: Uint8Array[] = [];
  source.subscribe((update) => updates.push(update));
  const body = scriptBody(source);
  body.write((w) =>
    w.insertBlocks(null, [
      { type: "block", attrs: { id: BLOCK, type: "action" }, content: [] },
    ]),
  );
  for (let n = 1; n < 20; n++)
    body.write((w) => w.insertText(BLOCK, n - 1, String(n % 10)));
  return updates;
}

function stateOf(doc: CrdtDoc): string {
  return JSON.stringify([
    [...doc.encodeStateVector()],
    scriptBody(doc).materialize(),
  ]);
}

/** True when `merged` gives a fresh document the same state as `updates` applied one by one. */
function appliesTheSameAs(
  merged: Uint8Array,
  updates: readonly Uint8Array[],
): boolean {
  const once = createDoc();
  once.applyUpdate(merged);
  const each = createDoc();
  for (const update of updates) each.applyUpdate(update);
  return stateOf(once) === stateOf(each);
}

function setup(): {
  c: Coalescer;
  frames: FakeFrames;
  fake: FakeClock;
  applied: { merged: Uint8Array; through: number }[];
  updates: Uint8Array[];
} {
  const frames = fakeFrames();
  const fake = createFakeClock();
  const applied: { merged: Uint8Array; through: number }[] = [];
  const c = createCoalescer({
    apply: (merged, through) => applied.push({ merged, through }),
    frames,
    clock: fake.clock,
  });
  return { c, frames, fake, applied, updates: twentyUpdates() };
}

test("twenty updates in one frame are applied once, merged", () => {
  const { c, frames, fake, applied, updates } = setup();
  for (let n = 1; n <= 20; n++) c.push(updates[n - 1]!, n);
  expect(applied).toEqual([]);
  frames.fire();
  expect(applied).toHaveLength(1);
  expect(applied[0]!.through).toBe(20);
  expect(appliesTheSameAs(applied[0]!.merged, updates)).toBe(true);
  // the fallback timer was cancelled
  expect(fake.pending()).toBe(0);
});

test("a hidden tab still flushes within 50 ms", () => {
  const { c, frames, fake, applied, updates } = setup();
  c.push(updates[0]!, 1);
  fake.advance(49);
  expect(applied).toHaveLength(0);
  fake.advance(1);
  expect(applied).toHaveLength(1);
  // the frame request was cancelled
  expect(frames.requested()).toBe(0);
});

test("nothing is applied during a composition, however long it takes", () => {
  const { c, frames, fake, applied, updates } = setup();
  c.hold();
  c.push(updates[0]!, 1);
  c.push(updates[1]!, 2);
  frames.fire();
  fake.advance(3_600_000);
  expect(applied).toEqual([]);
  expect(c.pending()).toBe(2);
  // holds nest
  c.hold();
  c.release();
  expect(applied).toEqual([]);
  // released: applied at once, no frame needed
  c.release();
  expect(applied.map((a) => a.through)).toEqual([2]);
});

test("a hold cancels what was scheduled before it, and a flush asked for meanwhile waits", () => {
  const { c, frames, fake, applied, updates } = setup();
  c.push(updates[0]!, 1);
  c.hold();
  c.flushNow();
  expect([frames.requested(), fake.pending(), applied]).toEqual([0, 0, []]);
});

test("a merged update is applied through the highest local sequence pushed", () => {
  const { c, applied, updates } = setup();
  c.push(updates[0]!, 5);
  c.push(updates[1]!, 3);
  c.flushNow();
  expect(applied.map((a) => a.through)).toEqual([5]);
});

test("a push that arrives while applying waits for the next flush", () => {
  const frames = fakeFrames();
  const fake = createFakeClock();
  const updates = twentyUpdates();
  const applied: number[] = [];
  let depth = 0;
  let deepest = 0;
  const c = createCoalescer({
    apply: (_, through) => {
      depth += 1;
      deepest = Math.max(deepest, depth);
      applied.push(through);
      if (through === 1) {
        c.push(updates[1]!, 2);
        c.flushNow();
      }
      depth -= 1;
    },
    frames,
    clock: fake.clock,
  });
  c.push(updates[0]!, 1);
  frames.fire();
  expect([applied, c.pending()]).toEqual([[1], 1]);
  frames.fire();
  expect([applied, deepest, c.pending()]).toEqual([[1, 2], 1, 0]);
});

test("disposing flushes what is buffered and cancels what is scheduled", () => {
  const { c, frames, fake, applied, updates } = setup();
  c.push(updates[0]!, 1);
  c.push(updates[1]!, 2);
  c.dispose();
  expect(applied.map((a) => a.through)).toEqual([2]);
  expect([fake.pending(), frames.requested()]).toEqual([0, 0]);
  expect(() => c.push(updates[2]!, 3)).toThrow(RangeError);
});

test("a release without a hold is a caller's mistake", () => {
  const { c } = setup();
  expect(() => c.release()).toThrow(RangeError);
});
