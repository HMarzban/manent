import { expect, test } from "bun:test";
import { DOC, PROJECT } from "./seed.ts";
import { SAM_CLIENT, createServiceWorld } from "./service-world.ts";

test("subscribing with already-owned client identifiers skips writing to storage", () => {
  const world = createServiceWorld();
  const file = world.storage.open({ kind: "project", id: PROJECT });
  const originalRegister = file.log.registerClients.bind(file.log);
  const calls: number[][] = [];
  file.log.registerClients = (docId, userId, clientIds) => {
    calls.push([...clientIds]);
    return originalRegister(docId, userId, clientIds);
  };

  // First subscribe registers SAM_CLIENT
  world.service.receive(world.sam, {
    type: "SUBSCRIBE",
    docId: DOC,
    generation: 0,
    mode: "edit",
    clientIds: [SAM_CLIENT],
    lastServerSeq: 0,
  });
  expect(calls).toEqual([[SAM_CLIENT]]);

  // Second subscribe with the same clientId skips the storage write completely
  world.service.receive(world.sam, {
    type: "SUBSCRIBE",
    docId: DOC,
    generation: 1,
    mode: "edit",
    clientIds: [SAM_CLIENT],
    lastServerSeq: 0,
  });
  expect(calls).toEqual([[SAM_CLIENT]]);

  // Subscribing with one already-owned id and one new id writes only the new id
  world.service.receive(world.sam, {
    type: "SUBSCRIBE",
    docId: DOC,
    generation: 1,
    mode: "edit",
    clientIds: [SAM_CLIENT, SAM_CLIENT + 1],
    lastServerSeq: 0,
  });
  expect(calls).toEqual([[SAM_CLIENT], [SAM_CLIENT + 1]]);
});
