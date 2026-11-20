import { expect, test } from "bun:test";
import { createFakeClock } from "@manent/sync-client/testing";
import { createWakeWatch } from "../src/index.ts";
import { DOC, world } from "./relay-world.ts";

test("a gap in the clock reads as a wake, and an ordinary tick does not", () => {
  const time = createFakeClock(1_000_000);
  let woken = 0;
  const stop = createWakeWatch({
    clock: time.clock,
    tickMs: 5_000,
    gapMs: 15_000,
    onWake: () => {
      woken += 1;
    },
  });
  time.advance(60_000);
  expect(woken).toBe(0);
  // the machine slept: the next tick comes 40 s late
  time.jump(time.clock.now() + 40_000);
  time.advance(0);
  time.advance(30_000);
  expect(woken).toBe(1);
  stop();
  expect(time.pending()).toBe(0);
});

test("the demo's Connection cuts the node's link to the cloud, never the window's", async () => {
  const w = world();
  await w.open("sam", DOC);
  w.bridge.setConnection("offline", 0);
  w.windowTypes("sam", DOC, "on the train");
  await w.settle();
  expect(w.windowStatus(DOC)).toMatchObject({
    saved: true,
    synced: false,
    link: "offline",
  });
  expect(w.cloudText(DOC)).toEqual([]);
  w.bridge.setConnection("online", 0);
  await w.settle();
  expect(w.windowStatus(DOC)).toMatchObject({ saved: true, synced: true });
  expect(w.cloudText(DOC)).toEqual(["on the train"]);
});

test("a slow connection holds what the node relays, and the window is not told it is synced meanwhile", async () => {
  const w = world();
  await w.open("sam", DOC);
  w.bridge.setConnection("slow", 3_000);
  w.windowTypes("sam", DOC, "slowly");
  await w.flush();
  expect(w.bridge.status(DOC)).toMatchObject({ synced: false, waiting: 1 });
  expect(w.cloudText(DOC)).toEqual([]);
  await w.settle();
  expect(w.cloudText(DOC)).toEqual(["slowly"]);
  expect(w.bridge.status(DOC)).toMatchObject({ synced: true, waiting: 0 });
});
