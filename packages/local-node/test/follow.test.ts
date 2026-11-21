import { expect, test } from "bun:test";
import { createDoc, scriptBody } from "@manent/crdt";
import { blocksOf } from "@manent/schema";
import { DOC, typeInto, world } from "./relay-world.ts";

/** A deletion of text this device never had, as a frame of the cloud may carry it: it waits for that text. */
function unseenDeletion(): Uint8Array {
  const elsewhere = createDoc({ clientId: 9_001 });
  typeInto(elsewhere, "never here");
  const id = blocksOf(scriptBody(elsewhere).materialize())[0]?.attrs.id;
  if (id == null) throw new RangeError("the block was not written");
  scriptBody(elsewhere).write((w) => w.deleteText(id, 0, 5));
  return elsewhere.diff(elsewhere.encodeStateVector());
}

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

test("seed 40: a deletion the upstream cannot place yet never stops the node taking the window's edits", async () => {
  const w = world();
  await w.open("sam", DOC);
  w.windowTypes("sam", DOC, "first");
  await w.settle();
  await w.upstreamHears("sam", DOC, unseenDeletion());
  await w.cloudTypes("dana", DOC, " and hers");
  await w.settle();
  w.windowTypes("sam", DOC, " then mine");
  await w.settle();
  const text = ["first and hers then mine"];
  expect([w.nodeText(DOC), w.cloudText(DOC), w.windowText(DOC)]).toEqual([
    text,
    text,
    text,
  ]);
  // the window's edit was taken as it came, never refused and written again
  expect(w.windowEvents(DOC)).toEqual([
    { type: "receipt", sent: 1, setAside: 0, overlaps: 0 },
  ]);
});
