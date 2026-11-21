import { expect, test } from "bun:test";
import { scriptBody } from "@manent/crdt";
import { DOC, DOC2, world } from "./relay-world.ts";

test("the window is told the upstream's state as it changes, and no more often than every 250 ms", async () => {
  const w = world();
  await w.open("sam", DOC);
  const seen = (): string[][] =>
    w.statuses
      .slice(before)
      .map(({ status }) => [status.link, String(status.waiting)]);
  let before = w.statuses.length;
  w.bridge.setOnline(false);
  await w.flush();
  const offline = w.statuses.at(-1)?.status;
  expect(seen()).toEqual([["offline", "0"]]);
  expect(offline?.wentOfflineAt).toBe(w.clock.clock.now());
  before = w.statuses.length;
  for (let n = 0; n < 10; n++) {
    w.windowTypes("sam", DOC, `${n}`);
    await w.flush();
    w.clock.advance(10);
  }
  expect(seen()).toEqual([]);
  w.clock.advance(150);
  await w.flush();
  expect(seen()).toEqual([["offline", "1"]]);
});

test("text the upstream set aside is in the window's status", async () => {
  const w = world();
  await w.open("sam", DOC);
  await w.cloudTypes("dana", DOC, "A lamp.");
  await w.settle();
  w.bridge.setOnline(false);
  w.windowTypes("sam", DOC, " It flickers.");
  await w.settle();
  const dana = await w.browserHandle("dana", DOC);
  scriptBody(dana.doc()).write((writer) => {
    const [block] =
      scriptBody(dana.doc()).materialize().content?.[0]?.content ?? [];
    const id = block?.attrs?.id;
    if (typeof id === "string") writer.deleteBlock(id);
  });
  await w.settle();
  w.bridge.setOnline(true);
  await w.settle();
  expect(w.bridge.status(DOC).recovered.map((item) => item.text)).toEqual([
    " It flickers.",
  ]);
});

test("a script made on the device reads its owner's link to the cloud", async () => {
  const w = world({ madeOnDevice: true });
  w.cloudMakes(DOC2, "dana", ["sam"]);
  await w.open("sam", DOC2);
  await w.windowWritesLine("sam", DOC, "a scene of my own");
  await w.settle();
  expect([w.bridge.status(DOC2).link, w.bridge.status(DOC).link]).toEqual([
    "online",
    "online",
  ]);
});

test("seed 32: a script whose upstream was replaced is not synced until the node follows it", async () => {
  const w = world();
  await w.open("sam", DOC);
  w.windowTypes("sam", DOC, "first");
  await w.settle();
  // the follow waits for a turn the node has not finished
  w.holdNodeTurns(true);
  w.cloudRebuilds(DOC);
  await w.settle();
  const moving = w.bridge.status(DOC).synced;
  w.holdNodeTurns(false);
  await w.settle();
  expect([moving, w.bridge.status(DOC).synced]).toEqual([false, true]);
});
