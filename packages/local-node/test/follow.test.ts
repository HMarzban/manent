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

test("seed 4: a follow put off by a full disk catches up once another person's follow has moved the room", async () => {
  const w = world();
  await w.open("dana", DOC);
  await w.open("sam", DOC);
  w.windowTypes("sam", DOC, "first");
  await w.settle();
  w.nodeStorage.fillDisk(true);
  w.cloudRebuilds(DOC);
  await w.settle();
  w.nodeStorage.fillDisk(false);
  await w.settle();
  w.windowTypes("sam", DOC, " then more");
  await w.settle();
  expect([
    w.nodeText(DOC),
    w.cloudText(DOC),
    w.windowText(DOC, "dana"),
  ]).toEqual([["first then more"], ["first then more"], ["first then more"]]);
  expect(w.records.docState(DOC)?.generation).toBe(2);
});
