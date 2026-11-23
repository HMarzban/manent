import { expect, test } from "bun:test";
import type { Message } from "@manent/sync-protocol";
import { materializeVersion } from "../src/index.ts";
import {
  actionId,
  headingId,
  key,
  productionWorld,
  valueOf,
} from "./production-world.ts";
import { DOC } from "./seed.ts";

/** What the server answered each push: "ACK", or the ERROR's code and message. */
const answersOf = (messages: readonly Message[]): unknown[] =>
  messages.flatMap((m): unknown[] => {
    if (m.type === "ACK") return ["ACK"];
    return m.type === "ERROR" ? [[m.code, m.message]] : [];
  });

const subscribedOf = (messages: readonly Message[]) =>
  messages.find((m) => m.type === "SUBSCRIBED");

test("a pushed scene number is refused once the script is in production", async () => {
  const w = productionWorld();
  await w.lock();
  w.sam.take();
  w.sam.push((writer) => writer.setBlockAttrs(headingId(3), { num: "99" }));
  await w.run(Promise.resolve());
  const dana = w.join("dana", 2002);
  dana.take();
  dana.push((writer) => writer.setBlockAttrs(headingId(4), { num: "4" }));
  await w.run(Promise.resolve());
  expect([answersOf(w.sam.take()), answersOf(dana.take())]).toEqual([
    [[4422, "invalid"]],
    ["ACK"],
  ]);
});

test("a subscriber learns the lock table and the active revision", async () => {
  const w = productionWorld();
  const state = await w.lock();
  const subscribed = subscribedOf(w.join("dana", 2002).take());
  expect(
    subscribed?.type === "SUBSCRIBED" && [
      subscribed.lockLevel,
      subscribed.lockAnchors !== null &&
        "table" in subscribed.lockAnchors &&
        subscribed.lockAnchors.table.length,
      subscribed.revision?.setId,
    ],
  ).toEqual([1, 30, state.sets[1]!.setId]);
});

test("anchors survive a rebuild unchanged", async () => {
  const w = productionWorld();
  const state = await w.lock();
  const before = w.file.production.anchorHistory(DOC);
  w.sync.requestRebuild(DOC);
  w.clock.advance(10_000);
  await w.run(Promise.resolve());
  const moved = w.sam.take().some((m) => m.type === "GENERATION_MOVED");
  const subscribed = subscribedOf(w.join("dana", 2002).take());
  expect([
    w.file.log.get(DOC)?.generation,
    moved,
    w.file.production.anchorHistory(DOC),
    subscribed?.type === "SUBSCRIBED" && subscribed.lockAnchors,
  ]).toEqual([2, true, before, { table: state.anchors }]);
});

test("a version kept in production carries its lock table, and a restored scene keeps its issued number", async () => {
  const w = productionWorld();
  const state = await w.lock();
  const white = w.versions().find((v) => v.name === "White production draft")!;
  w.sam.push((writer) => {
    writer.deleteBlock(headingId(4));
    for (let line = 1; line <= 8; line++) writer.deleteBlock(actionId(4, line));
  });
  await w.run(Promise.resolve());
  const restored = await w.run(
    w.history.restore("priya", {
      docId: DOC,
      key: key(5),
      versionId: white.id,
      scope: { kind: "scene", headingId: headingId(4) },
      clientId: null,
    }),
  );
  const heading = w.blocks().find((b) => b.attrs.id === headingId(4));
  expect([
    materializeVersion(w.file, white)?.locks,
    restored.ok,
    heading?.attrs.num,
  ]).toEqual([state.anchors, true, "4"]);
  expect(valueOf(w.service.state("priya", DOC)).sceneNumbers[3]).toEqual({
    blockId: headingId(4),
    num: "4",
    reserved: false,
  });
});
