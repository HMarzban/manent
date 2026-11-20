import { expect, test } from "bun:test";
import { DOC2, PROJECT, world } from "./relay-world.ts";

test("a document made elsewhere is mirrored with the cloud's kind, home and role", async () => {
  const w = world();
  w.cloudMakes(DOC2, "dana", ["sam"]);
  await w.signedIn("sam");
  expect(await w.mirror.ensure("sam", DOC2)).toEqual({ ok: true });
  expect(w.nodeStorage.directory.placeOf(DOC2)).toEqual({
    home: { kind: "project", id: PROJECT },
    kind: "script",
  });
  expect(w.nodeStorage.directory.roleOf(DOC2, "sam")).toEqual({
    role: "edit",
    capabilities: [],
  });
  expect(w.records.docState(DOC2)).toEqual({
    userId: "sam",
    state: "synced",
    generation: 1,
  });
});

test("offline, an unknown document is not invented", async () => {
  const w = world();
  w.cloudMakes(DOC2, "dana", ["sam"]);
  await w.signedIn("sam");
  w.cloudDown(true);
  expect(await w.mirror.ensure("sam", DOC2)).toEqual({
    ok: false,
    code: "unreachable",
  });
  expect(w.nodeStorage.directory.placeOf(DOC2)).toBeNull();
  expect(w.records.docState(DOC2)).toBeNull();
});
