import { expect, test } from "bun:test";
import { indexDocId, workspaceHome } from "@manent/sync-protocol";
import { DOC, DOC2, HOME, world } from "./relay-world.ts";
import type { WorldOptions } from "./relay-world.ts";

const PAPER = "script.paper";
const WORKSPACE = "lamp-room";

/** A world where You writes on the device and the cloud has never seen it. */
function handoffWorld(options?: WorldOptions) {
  return world({ ...options, madeOnDevice: true });
}

test("a script written on the device is adopted, then relayed", async () => {
  const w = handoffWorld();
  await w.windowWritesLine("you", DOC, "first scene");
  await w.settle();
  // You has not signed in to sync
  expect(w.cloudHas(DOC)).toBe(false);
  await w.signInToSync("you");
  await w.settle();
  expect(w.cloudText(DOC)).toEqual(["first scene"]);
  expect(w.records.docState(DOC)).toEqual({
    userId: "you",
    state: "synced",
    generation: 1,
  });
  expect(w.windowStatus(DOC, "you")).toMatchObject({
    saved: true,
    synced: true,
    neverSynced: false,
  });
});

test("a hand-off interrupted at any step is adopted once", async () => {
  const faults: [string, WorldOptions][] = [
    ["drop_request", { drop: "request" }],
    ["drop_response", { drop: "response" }],
    ["crash_after_start", { crashOn: "startHandoff" }],
    ["crash_before_finish", { crashOn: "finishHandoff" }],
  ];
  for (const [fault, options] of faults) {
    const w = handoffWorld(options);
    await w.windowWritesLine("you", DOC, "one");
    await w.signInToSync("you");
    await w.settle();
    if (fault.startsWith("crash")) {
      await w.restartNode();
      await w.settle();
    }
    expect([fault, w.cloudText(DOC), w.cloudAdoptions(DOC)]).toEqual([
      fault,
      ["one"],
      1,
    ]);
  }
});

test("edits made while the hand-off is in flight reach the cloud", async () => {
  const w = handoffWorld({ slowAdopt: true });
  await w.windowWritesLine("you", DOC, "before");
  await w.signInToSync("you");
  await w.windowWritesLine("you", DOC, "during");
  await w.settle();
  expect(w.cloudText(DOC)).toEqual(["before", "during"]);
  expect(w.cloudRefusals()).toEqual([]);
});

test("a setting requested during the hand-off goes upstream as a request", async () => {
  const w = handoffWorld({ slowAdopt: true });
  await w.windowWritesLine("you", DOC, "a scene");
  w.windowSets("you", DOC, PAPER, "a4");
  await w.settle();
  await w.signInToSync("you");
  w.windowSets("you", DOC, PAPER, "letter");
  await w.settle();
  // the first was the authority's; the second a request
  expect(w.cloudSettings(DOC)).toEqual({ [PAPER]: "letter" });
  expect(w.cloudRefusals()).toEqual([]);
});

test("a retry after the cloud adopted sends nothing twice", async () => {
  const w = handoffWorld({ drop: "response" });
  await w.windowWritesLine("you", DOC, "one");
  await w.settle();
  await w.signInToSync("you");
  await w.settle();
  await w.windowWritesLine("you", DOC, "two");
  await w.settle();
  expect(w.cloudLog(DOC).map((row) => row.origin)).toEqual(["import", "edit"]);
  expect(w.cloudText(DOC)).toEqual(["one", "two"]);
});

test("a refused hand-off leaves the script on the device", async () => {
  const w = handoffWorld({ slowAdopt: true });
  // the project is Dana's, and You cannot add scripts to it
  w.cloudMakes(DOC2, "dana", []);
  await w.windowWritesLine("you", DOC, "mine");
  await w.settle();
  await w.signInToSync("you");
  w.windowSets("you", DOC, PAPER, "a4");
  await w.settle();
  const asked = w.life.lastSet.get("you")?.message;
  if (asked?.type !== "SET") throw new Error("the window asked for no setting");
  const refusals = w.controls
    .filter((c) => c.kind === "upstream_refused")
    .map((c) => JSON.parse(new TextDecoder().decode(c.data)));
  expect(refusals).toEqual([
    { clientSeq: asked.clientSeq, message: "handoff_refused" },
  ]);
  expect(w.records.docState(DOC)).toBeNull();
  expect(w.records.handoff(DOC)?.refused).toBe("forbidden");
  await w.windowWritesLine("you", DOC, "still mine");
  await w.settle();
  expect(w.nodeText(DOC)).toEqual(["mine", "still mine"]);
  expect(w.nodeLog(DOC).map((row) => row.origin)).toEqual(["edit", "edit"]);
  expect(w.bridge.status(DOC)).toMatchObject({
    neverSynced: true,
    handoffRefused: "forbidden",
  });
});

test("a refused hand-off is not tried again", async () => {
  const w = handoffWorld();
  w.cloudMakes(DOC2, "dana", []);
  await w.windowWritesLine("you", DOC, "mine");
  await w.signInToSync("you");
  await w.settle();
  expect(w.adoptCalls).toBe(1);
  w.handOver("you");
  await w.settle();
  expect(w.adoptCalls).toBe(1);
});

test("a hand-off waits for its workspace's index to reach the cloud", async () => {
  const w = handoffWorld();
  const index = indexDocId("workspace", WORKSPACE);
  await w.windowWritesLine("you", DOC, "in the workspace");
  w.workspaces.set(DOC, WORKSPACE);
  await w.signInToSync("you");
  await w.settle();
  expect([w.adoptCalls, w.cloudHas(DOC)]).toEqual([0, false]);
  const made = w.cloud.service.access.create("you", {
    docId: index,
    kind: "index",
    home: workspaceHome(WORKSPACE),
  });
  expect(made.ok).toBe(true);
  w.records.setDocState(index, "you", "synced", 1);
  await w.settle();
  expect(w.cloudText(DOC)).toEqual(["in the workspace"]);
  expect(w.cloudHas(DOC)).toBe(true);
});

test("documents of a kind the cloud does not take stay on the device", async () => {
  const w = handoffWorld();
  const home = { kind: "project" as const, id: HOME.slice("project:".length) };
  w.nodeStorage.directory.place(DOC, home, "rundown", "you");
  w.nodeStorage.open(home).log.create({
    id: DOC,
    kind: "rundown",
    ownerUserId: null,
    schemaVersion: 1,
    engineVersion: null,
  });
  w.nodeStorage.directory.setRole(DOC, "you", "owner", []);
  await w.signInToSync("you");
  await w.settle();
  const pending = w.clock.pending();
  w.clock.advance(120_000);
  await w.settle();
  expect([
    w.adoptCalls,
    w.records.docState(DOC),
    w.records.handoff(DOC),
  ]).toEqual([0, null, null]);
  expect(w.clock.pending()).toBeLessThanOrEqual(pending);
});
