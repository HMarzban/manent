import { expect, test } from "bun:test";
import { DOC, nodeWorld } from "./relay-world.ts";

test("a full disk while online passes edits to the cloud and saves them when space returns", async () => {
  const w = nodeWorld();
  await w.openSynced("sam", DOC);
  w.nodeStorage.fillDisk(true);
  w.windowTypes("sam", DOC, "on a full disk");
  await w.settle();
  expect(w.windowStatus("sam", DOC)).toMatchObject({
    saved: false,
    side: expect.arrayContaining(["not_saved"]),
  });
  // Not saved on this device · Synced
  expect(w.cloudText(DOC)).toEqual(["on a full disk"]);
  w.nodeStorage.fillDisk(false);
  w.clock.advance(5_000);
  await w.settle();
  expect(w.windowStatus("sam", DOC)).toMatchObject({
    saved: true,
    synced: true,
  });
  expect(w.nodeText(DOC)).toEqual(["on a full disk"]);
});

test("a full disk while offline keeps typing and says the device is failing", async () => {
  const w = nodeWorld();
  await w.openSynced("sam", DOC);
  w.cloudNet.partition(true);
  w.nodeStorage.fillDisk(true);
  w.windowTypes("sam", DOC, "on a full disk, offline");
  await w.settle();
  expect(w.windowStatus("sam", DOC)).toMatchObject({
    saved: false,
    link: "offline",
    side: expect.arrayContaining(["not_saved"]),
  });
  expect(w.cloudText(DOC)).toEqual([]);
});
