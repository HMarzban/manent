import { expect, test } from "bun:test";
import { DOC, world } from "./relay-world.ts";

const PAPER = "script.paper";

/** The data of each CONTROL `upstream_refused` the person's windows were sent. */
function refusedTo(w: ReturnType<typeof world>, userId: string): unknown[] {
  return w.controls
    .filter((c) => c.userId === userId && c.kind === "upstream_refused")
    .map((c) => JSON.parse(new TextDecoder().decode(c.data)));
}

test("a window's edit goes up once and comes back to nobody", async () => {
  const w = world();
  await w.open("sam", DOC);
  w.windowTypes("sam", DOC, "scene one");
  await w.settle();
  expect(w.cloudText(DOC)).toEqual(["scene one"]);
  expect(w.cloudPushes(DOC)).toBe(1);
  // nothing came back down as "upstream"
  expect(w.nodeLog(DOC).map((r) => r.origin)).toEqual(["edit"]);
});

test("another person's edit at the cloud reaches the window through the node", async () => {
  const w = world();
  await w.open("sam", DOC);
  await w.cloudTypes("dana", DOC, "dana's line");
  await w.settle();
  expect(w.nodeLog(DOC).map((r) => [r.origin, r.userId])).toEqual([
    ["upstream", "sam"],
  ]);
  expect(w.windowText(DOC, "sam")).toEqual(["dana's line"]);
});

test("two people on one node push only their own edits", async () => {
  const w = world();
  await w.open("sam", DOC);
  await w.open("dana", DOC);
  w.windowTypes("sam", DOC, "s");
  w.windowTypes("dana", DOC, "d");
  await w.settle();
  expect(w.cloudRefusals()).toEqual([]);
  expect(w.cloudAuthors(DOC)).toEqual(new Set(["sam", "dana"]));
});

test("a node that stopped between the local commit and the upstream write sends the edit at next launch", async () => {
  const w = world();
  await w.open("sam", DOC);
  // the upstream store never settles its append
  w.upstreamStoreHolds(true);
  w.windowTypes("sam", DOC, "kept");
  await w.settleNode();
  w.crashNode();
  await w.restartNode();
  await w.open("sam", DOC);
  await w.settle();
  expect(w.cloudText(DOC)).toEqual(["kept"]);
});

test("a setting goes up as a request, and its refusal comes back to the window", async () => {
  const w = world();
  await w.open("sam", DOC);
  w.windowSets("sam", DOC, PAPER, "a5");
  await w.settle();
  const sent = w.life.lastSet.get("sam")?.message;
  if (sent?.type !== "SET") throw new Error("the window sent no setting");
  expect(
    w.cloud.sets.map((m) => [m.key, new TextDecoder().decode(m.value)]),
  ).toEqual([[PAPER, '"a5"']]);
  expect(refusedTo(w, "sam")).toEqual([
    { clientSeq: sent.clientSeq, message: "bad_value" },
  ]);
});

test("a setting the window sends twice goes up once", async () => {
  const w = world();
  await w.open("sam", DOC);
  w.windowSets("sam", DOC, PAPER, "a4");
  await w.settle();
  w.resendLastSet("sam");
  await w.settle();
  expect(w.cloud.sets).toHaveLength(1);
  expect(w.cloudSettings(DOC)).toEqual({ [PAPER]: "a4" });
});

test("a cloud rebuild while a window types is followed, not merged twice", async () => {
  const w = world();
  await w.open("sam", DOC);
  w.windowTypes("sam", DOC, "one");
  await w.settle();
  w.cloudRebuilds(DOC);
  w.windowTypes("sam", DOC, " two");
  await w.settle();
  expect(w.cloudText(DOC)).toEqual(["one two"]);
  expect(w.nodeText(DOC)).toEqual(["one two"]);
  expect(w.windowText(DOC)).toEqual(["one two"]);
  expect(w.nodeGeneration(DOC)).toBe(2);
  // the upstream's, once
  expect(w.windowEvents(DOC).filter((e) => e.type === "rebuilt")).toHaveLength(
    1,
  );
});

test("a push the cloud refused is written back by block and the node follows", async () => {
  const w = world();
  await w.open("sam", DOC);
  w.windowTypes("sam", DOC, "first");
  await w.settle();
  w.cloudRefusesNext(DOC);
  w.windowTypes("sam", DOC, " then more");
  await w.settle();
  expect(w.cloudText(DOC)).toEqual(["first then more"]);
  expect(w.nodeText(DOC)).toEqual(["first then more"]);
  expect(w.windowText(DOC)).toEqual(["first then more"]);
  const rejected = w.windowEvents(DOC).filter((e) => e.type === "rejected");
  expect(rejected).toMatchObject([{ type: "rejected", replayed: 1 }]);
  expect(w.cloudRefusals()).toHaveLength(1);
});

test("a cloud restored from a backup is healed by the node's upstream client", async () => {
  const w = world();
  await w.open("sam", DOC);
  w.snapshotCloud();
  w.windowTypes("sam", DOC, "kept");
  await w.settle();
  expect(w.windowStatus(DOC)).toMatchObject({ synced: true });
  w.restoreCloud();
  await w.settle();
  expect(w.cloudText(DOC)).toEqual(["kept"]);
  expect(w.cloudLog(DOC).map((r) => r.origin)).toContain("heal");
});

test("one person on the desktop and in a browser is two devices", async () => {
  const w = world();
  await w.open("sam", DOC);
  w.windowTypes("sam", DOC, "desk ");
  await w.settle();
  await w.cloudTypes("sam", DOC, "browser");
  await w.settle();
  const browser = (await w.browserHandle("sam", DOC)).doc().clientId;
  expect(w.cloudRefusals()).toEqual([]);
  expect(w.cloud.pushedIds.get("sam")?.has(browser)).toBe(false);
  expect(w.cloudText(DOC)).toEqual(["desk browser"]);
  expect(w.windowText(DOC)).toEqual(["desk browser"]);
  expect(w.browserText("sam", DOC)).toEqual(["desk browser"]);
});

test("a node that crashed between replaced and its follow follows at next open", async () => {
  const w = world();
  await w.open("sam", DOC);
  w.windowTypes("sam", DOC, "one");
  await w.settle();
  // the follow waits for a turn the node never finishes
  w.holdNodeTurns(true);
  w.cloudRebuilds(DOC);
  await w.settle();
  w.crashNode();
  await w.restartNode();
  await w.open("sam", DOC);
  await w.settle();
  expect(w.nodeGeneration(DOC)).toBe(2);
  expect(w.nodeText(DOC)).toEqual(["one"]);
});
