import { expect, test } from "bun:test";
import { jsonMap, scriptBody } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import { indexDocId, workspaceHome } from "@manent/sync-protocol";
import { DOC, nodeWorld } from "./relay-world.ts";

const WORKSPACE = "lamp-room";
const key = (n: number): string => n.toString(16).padStart(32, "0");
const block = (id: string, type: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type },
  content: [{ type: "text", text }],
});

/** The ID of the version a POST /api/versions/name answer names. */
function versionIdOf(answer: unknown): string {
  const version =
    typeof answer === "object" && answer !== null && "version" in answer
      ? answer.version
      : null;
  const id =
    typeof version === "object" && version !== null && "id" in version
      ? version.id
      : null;
  if (typeof id !== "string") throw new Error("no version was named");
  return id;
}

test("the window signs in at the node, opens a script and is answered by the node alone", async () => {
  const w = nodeWorld();
  const answer = await w.request("POST", "/api/sign-in", {
    body: { userId: "you" },
  });
  const signedIn: unknown = await answer.json();
  expect([answer.status, signedIn]).toEqual([
    200,
    { token: expect.any(String), user: { userId: "you", name: "You" } },
  ]);
  await w.chooses("you");
  const handle = await w.open("you", DOC, true);
  w.windowTypes("you", DOC, "a scene of my own");
  await w.settle();
  expect(handle.status.get()).toMatchObject({ saved: true, waiting: 0 });
  expect(w.nodeText(DOC)).toEqual(["a scene of my own"]);
  // the cloud saw nothing
  expect(w.cloudHas(DOC)).toBe(false);
  expect(w.records.person("you")).toMatchObject({
    wantsCloud: false,
    cloudToken: null,
  });
});

test("Sign in to sync gives the node a cloud session and starts the hand-off", async () => {
  const w = nodeWorld();
  const token = await w.chooses("you");
  await w.open("you", DOC, true);
  w.windowTypes("you", DOC, "first scene");
  await w.settle();
  const answer = await w.request("POST", "/api/local/sign-in-to-sync", {
    token,
  });
  expect([answer.status, await answer.json()]).toEqual([
    200,
    { cloud: "signed_in" },
  ]);
  expect(w.records.person("you")?.cloudToken).toEqual(expect.any(String));
  await w.settle();
  expect(w.cloudText(DOC)).toEqual(["first scene"]);
  expect(w.records.docState(DOC)).toEqual({
    userId: "you",
    state: "synced",
    generation: 1,
  });
});

test("a reset of the demo empties the node, which keeps who was here", async () => {
  const w = nodeWorld();
  w.records.setSeedId("a");
  w.cloud.seedId = "b";
  await w.openSynced("sam", DOC);
  w.windowTypes("sam", DOC, "before the reset");
  await w.settle();
  expect(w.nodeStorage.directory.homes()).toEqual([]);
  expect(await w.upstreamStores.store("sam").documents()).toEqual([]);
  expect(w.records.people().map((person) => person.userId)).toEqual(["sam"]);
  expect(w.records.seedId()).toBe("b");
});

test("a hand-off that fails partway leaves the node answering its window", async () => {
  const w = nodeWorld({ crashOn: "finishHandoff" });
  const token = await w.chooses("you");
  const handle = await w.open("you", DOC, true);
  w.windowTypes("you", DOC, "first scene");
  await w.settle();
  await w.request("POST", "/api/local/sign-in-to-sync", { token });
  await w.settle();
  w.windowTypes("you", DOC, " goes on");
  await w.settle();
  expect([w.cloudHas(DOC), w.nodeText(DOC)]).toEqual([
    true,
    ["first scene goes on"],
  ]);
  expect(handle.status.get()).toMatchObject({ saved: true, waiting: 0 });
});

test("a script made in a workspace before Sign in to sync is handed over into it after the node restarts", async () => {
  const w = nodeWorld();
  const token = await w.chooses("you");
  const index = indexDocId("workspace", WORKSPACE);
  const home = workspaceHome(WORKSPACE);
  const body = { docId: index, kind: "index", home };
  await w.request("POST", "/api/docs", { token, body });
  // the window makes a workspace's script once it holds the workspace's index
  await w.open("you", index);
  await w.open("you", DOC, true, WORKSPACE);
  w.windowTypes("you", DOC, "first scene");
  await w.settle();
  await w.restartNode();
  await w.request("POST", "/api/local/sign-in-to-sync", { token });
  await w.settle();
  expect(w.adoptions).toEqual([
    { docId: index, workspaceId: null },
    { docId: DOC, workspaceId: WORKSPACE },
  ]);
  expect(w.cloudText(DOC)).toEqual(["first scene"]);
});

test("seed 20: a hand-off cut short by a restart goes through after it", async () => {
  const w = nodeWorld({ crashOn: "finishHandoff" });
  const token = await w.chooses("you");
  await w.open("you", DOC, true);
  w.windowTypes("you", DOC, "first scene");
  await w.settle();
  await w.request("POST", "/api/local/sign-in-to-sync", { token });
  await w.settle();
  await w.restartNode();
  expect(w.records.docState(DOC)).toEqual({
    userId: "you",
    state: "synced",
    generation: 1,
  });
  expect(w.cloudText(DOC)).toEqual(["first scene"]);
});

test("seed 4: a setting held by a full disk before Sign in to sync never reaches the cloud as a push it refuses", async () => {
  const w = nodeWorld();
  const token = await w.chooses("you");
  await w.open("you", DOC, true);
  w.windowTypes("you", DOC, "first scene");
  w.windowSets("you", DOC, "script.paper", "a4");
  await w.settle();
  w.nodeStorage.fillDisk(true);
  w.windowSets("you", DOC, "script.paper", "letter");
  await w.settle();
  await w.request("POST", "/api/local/sign-in-to-sync", { token });
  w.nodeStorage.fillDisk(false);
  await w.settle();
  // the node's next start writes upstream what its log holds beyond the cloud's
  await w.restartNode();
  expect(w.cloud.refusals).toEqual([]);
  expect(w.cloudSettings(DOC)).toEqual({ "script.paper": "letter" });
});

test("a window that re-sends an edit whose acknowledgement it lost says synced once the node holds it", async () => {
  const w = nodeWorld();
  await w.openSynced("sam", DOC);
  w.windowLosesAcks("sam", true);
  w.windowTypes("sam", DOC, "a line the node holds");
  await w.settle();
  w.windowLosesAcks("sam", false);
  w.windowReconnects("sam");
  await w.settle();
  expect(w.nodeText(DOC)).toEqual(["a line the node holds"]);
  const told = w.windowStatusesAfterAck("sam");
  expect(told.map((status) => [status?.synced, status?.waiting])).toEqual([
    [true, 0],
  ]);
  expect(w.windowStatus("sam", DOC)).toMatchObject({
    synced: true,
    waiting: 0,
  });
});

test("text a restore sent on to the cloud wrote, which an offline writer removes unseen, is kept as the window's Recovered text", async () => {
  const w = nodeWorld();
  const window = await w.openSynced("sam", DOC);
  scriptBody(window.doc()).write((writer) => {
    writer.insertBlocks(null, [
      block("lamp-heading", "scene_heading", "INT. LAMP ROOM - NIGHT"),
      block("lamp-action", "action", "The lamp burns."),
    ]);
    writer.insertBlocks("lamp-action", [
      block("yard-heading", "scene_heading", "EXT. YARD - DAY"),
      block("yard-action", "action", "Rain."),
    ]);
  });
  await w.settle();
  const token = w.tokens.get("sam") ?? null;
  const named = await w.drive(
    w.request("POST", "/api/versions/name", {
      token,
      body: {
        docId: DOC,
        key: key(1),
        name: "Table read",
        fromVersionId: null,
      },
    }),
  );
  const versionId = versionIdOf(await named.json());
  scriptBody(window.doc()).write((writer) => writer.deleteBlock("lamp-action"));
  await w.settle();
  const dana = await w.browserHandle("dana", DOC);
  w.browserOnline("dana", false);
  const clientId = await w.drive(window.reserveClientId());
  const body = {
    docId: DOC,
    key: key(2),
    versionId,
    scope: { kind: "script" },
    clientId,
  };
  const restored = await w.drive(
    w.request("POST", "/api/versions/restore", { token, body }),
  );
  await w.settle();
  expect([restored.status, w.cloudText(DOC)]).toEqual([
    200,
    ["INT. LAMP ROOM - NIGHT", "The lamp burns.", "EXT. YARD - DAY", "Rain."],
  ]);
  // Dana's scene was its heading alone: deleting it takes its section, and the line restored there
  scriptBody(dana.doc()).write((writer) => writer.deleteBlock("lamp-heading"));
  w.browserOnline("dana", true);
  await w.settle();
  expect(w.cloudText(DOC)).toEqual(["EXT. YARD - DAY", "Rain."]);
  expect(window.recovered.get().map((item) => item.text)).toEqual([
    "The lamp burns.",
  ]);
});

test("relayControl delivers relayed cloud CONTROL kinds (12-17) to subscribed document windows", async () => {
  const w = nodeWorld();
  const token = await w.chooses("you");
  await w.open("you", DOC, true);
  w.windowTypes("you", DOC, "first scene");
  await w.settle();
  await w.request("POST", "/api/local/sign-in-to-sync", { token });
  await w.settle();
  const handle = await w.browserHandle("you", DOC);
  const controls: { kind: string; text: string }[] = [];
  handle.on((event) => {
    if (event.type === "control")
      controls.push({
        kind: event.kind,
        text: new TextDecoder().decode(event.data),
      });
  });
  w.cloud.service.broadcast(
    DOC,
    "driver_changed",
    new TextEncoder().encode('{"docId":"' + DOC + '","driver":null,"at":1000}'),
  );
  await w.settle();
  expect(controls.some((c) => c.kind === "driver_changed")).toBe(true);
});

test("opening a cloud-seeded private index through the local node mirrors and syncs it instead of creating a duplicate copy", async () => {
  const w = nodeWorld();
  const userIdx = indexDocId("user", "sam");
  w.cloud.service.access.create("sam", {
    docId: userIdx,
    kind: "index",
    home: "user",
  });
  const seeded = await w.browserHandle("sam", userIdx);
  jsonMap(seeded.doc(), "writing").set(DOC, { position: "private", at: 100 });
  await w.settle();

  const token = await w.chooses("sam");
  const created = await w.drive(
    w.request("POST", "/api/docs", {
      token,
      body: { docId: userIdx, kind: "index", home: "user" },
    }),
  );
  expect(created.status).toBe(200);
  const handle = await w.open("sam", userIdx);
  await w.settle();
  expect(w.records.docState(userIdx)).toEqual({
    userId: "sam",
    state: "synced",
    generation: 1,
  });
  expect(handle.status.get()).toMatchObject({
    saved: true,
    synced: true,
    waiting: 0,
    link: "online",
  });
  expect(jsonMap(handle.doc(), "writing").get(DOC)).toEqual({
    position: "private",
    at: 100,
  });
});

test("Sign in to sync hands over a person's private index, workspace index and script made on the device", async () => {
  const w = nodeWorld();
  const token = await w.chooses("you");
  const userIdx = indexDocId("user", "you");
  const wsIdx = indexDocId("workspace", WORKSPACE);
  await w.request("POST", "/api/docs", {
    token,
    body: { docId: userIdx, kind: "index", home: "user" },
  });
  await w.open("you", userIdx);
  await w.request("POST", "/api/docs", {
    token,
    body: { docId: wsIdx, kind: "index", home: workspaceHome(WORKSPACE) },
  });
  await w.open("you", wsIdx);
  await w.open("you", DOC, true, WORKSPACE);
  w.windowTypes("you", DOC, "first scene");
  await w.settle();
  const answer = await w.request("POST", "/api/local/sign-in-to-sync", {
    token,
  });
  expect(answer.status).toBe(200);
  await w.settle();
  expect(w.records.docState(userIdx)?.state).toBe("synced");
  expect(w.records.docState(wsIdx)?.state).toBe("synced");
  expect(w.records.docState(DOC)?.state).toBe("synced");
  expect(w.cloudText(DOC)).toEqual(["first scene"]);
});
