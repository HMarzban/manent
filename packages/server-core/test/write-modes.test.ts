import { expect, test } from "bun:test";
import { scriptSettings } from "@manent/crdt";
import { DOC, DOC2 } from "./seed.ts";
import { SAM_CLIENT, push, set, subscribe } from "./service-world.ts";
import { ack, createRelayWorld, roomDoc } from "./relay-world.ts";

test("each document is written in its own mode", () => {
  const world = createRelayWorld();
  const { service, clock, sam, upstream, typingIn } = world;
  for (const docId of [DOC, DOC2]) {
    service.receive(sam, subscribe(docId, "edit", [SAM_CLIENT]));
    sam.take();
    service.receive(sam, push(docId, 1, typingIn(docId)));
  }
  clock.runDeferred();
  // only the relayed one goes upstream
  expect(upstream.items.map((i) => i.docId)).toEqual([DOC2]);
  service.receive(sam, set(DOC, 2, "paper", "a4"));
  service.receive(sam, set(DOC2, 2, "paper", "a4"));
  clock.runDeferred();
  // the authority writes it; the relay hands it on
  expect(scriptSettings(roomDoc(world, DOC)).entries()).toEqual({
    paper: "a4",
  });
  expect(scriptSettings(roomDoc(world, DOC2)).entries()).toEqual({});
  expect(upstream.items.at(-1)).toMatchObject({
    kind: "set",
    docId: DOC2,
    clientSeq: 2,
    key: "paper",
  });
});

test("a document moved to relay keeps its room, its log and its subscribers", () => {
  const { service, clock, sam, upstream, modes, typingIn } = createRelayWorld();
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  sam.take();
  service.receive(sam, push(DOC, 1, typingIn(DOC)));
  clock.runDeferred();
  modes.set(DOC, "relay");
  service.modeChanged(DOC);
  service.receive(sam, push(DOC, 2, typingIn(DOC, undefined, " more")));
  clock.runDeferred();
  expect(sam.take()).toEqual([ack(DOC, 1, 1), ack(DOC, 2, 2)]);
  expect(upstream.items.map((i) => i.kind === "update" && i.seq)).toEqual([2]);
});
