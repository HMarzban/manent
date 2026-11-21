import { expect, test } from "bun:test";
import { DOC, world } from "./relay-world.ts";

test("seed 4: a follow put off by a full disk does not run again once another follow has moved the room", async () => {
  const w = world();
  await w.open("sam", DOC);
  w.windowTypes("sam", DOC, "first");
  await w.settle();
  w.nodeStorage.fillDisk(true);
  w.cloudRebuilds(DOC);
  await w.settle();
  // a second rebuild is heard while the first follow still waits for space
  w.cloudRebuilds(DOC);
  await w.settle();
  w.nodeStorage.fillDisk(false);
  await w.settle();
  expect([w.nodeText(DOC), w.cloudText(DOC), w.windowText(DOC)]).toEqual([
    ["first"],
    ["first"],
    ["first"],
  ]);
  expect(w.records.docState(DOC)?.generation).toBe(3);
});
