import { expect, test } from "bun:test";
import { memoryTabs } from "../src/testing/index.ts";
import { DOC, setup } from "./scripted-server.ts";

test("client IDs adopted from a window are registered with the server", async () => {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  await w.online();
  const own = h.doc().clientId;
  h.adoptClientIds([111, 222]);
  await w.settle();
  const subscribes = w.server.got("SUBSCRIBE");
  const stored = (await w.store.load(DOC))!.meta.clientIds;
  // nothing new: no new SUBSCRIBE
  h.adoptClientIds([111]);
  await w.settle();
  expect([
    subscribes.at(-1)?.clientIds,
    stored,
    w.server.got("SUBSCRIBE"),
  ]).toEqual([[own, 111, 222], [own, 111, 222], subscribes]);
});

test("a tab that does not lead adopts no client IDs", async () => {
  const w = await setup();
  const tabs = memoryTabs();
  const leader = w.makeClient({ leader: tabs.port("a") });
  await leader.open(DOC);
  const follower = await w.makeClient({ leader: tabs.port("b") }).open(DOC);
  await w.online();
  expect(() => follower.adoptClientIds([111])).toThrow(RangeError);
});
