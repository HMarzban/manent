import { expect, test } from "bun:test";
import { DOC, nodeWorld } from "./relay-world.ts";

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
