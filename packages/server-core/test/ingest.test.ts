import { expect, test } from "bun:test";
import { createDoc, scriptBody } from "@manent/crdt";
import { DOC, DOC2 } from "./seed.ts";
import { DANA_CLIENT, SAM_CLIENT, subscribe } from "./service-world.ts";
import { B2, createRelayWorld, tail } from "./relay-world.ts";

/** A document of the cloud's, where `clientId` typed `text` into a block of its own. */
function docWithTyping(text: string, clientId: number) {
  const doc = createDoc({ clientId });
  scriptBody(doc).write((w) =>
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: { id: B2, type: "action" },
        content: [{ type: "text", text }],
      },
    ]),
  );
  return doc;
}

test("an update from upstream is stored and shown to every editor, and goes back to nobody", () => {
  const world = createRelayWorld();
  const { service, clock, sam, upstream } = world;
  service.receive(sam, subscribe(DOC2, "edit", [SAM_CLIENT]));
  sam.take();
  const cloud = docWithTyping("from dana", DANA_CLIENT);
  service.ingest(DOC2, "sam", (vector) => cloud.diff(vector));
  clock.runDeferred();
  expect(sam.take()).toEqual([
    {
      type: "SYNC",
      docId: DOC2,
      generation: 1,
      step: "update",
      data: expect.any(Uint8Array),
    },
  ]);
  expect(tail(world, DOC2).map((r) => [r.origin, r.userId])).toEqual([
    ["upstream", "sam"],
  ]);
  expect(upstream.items).toEqual([]);
  // nothing new: nothing stored, nothing sent
  service.ingest(DOC2, "sam", (vector) => cloud.diff(vector));
  clock.runDeferred();
  expect(tail(world, DOC2)).toHaveLength(1);
  expect(sam.take()).toEqual([]);
});

test("an update from upstream is stored though no room is free to load it", () => {
  const world = createRelayWorld({ limits: { maxLoadedRooms: 1 } });
  const { service, clock, sam } = world;
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  const cloud = docWithTyping("from dana", DANA_CLIENT);
  service.ingest(DOC2, "sam", (vector) => cloud.diff(vector));
  clock.runDeferred();
  expect(tail(world, DOC2).map((r) => [r.origin, r.userId])).toEqual([
    ["upstream", "sam"],
  ]);
});

test("ingest refuses a document this node is the authority for", () => {
  const { service } = createRelayWorld();
  expect(() =>
    service.ingest(DOC, "sam", () => new Uint8Array([0, 0])),
  ).toThrow(new RangeError("ingest is for a relayed document"));
});
