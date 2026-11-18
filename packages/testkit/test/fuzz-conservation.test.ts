import { expect, test } from "bun:test";
import { scriptBody } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import fc from "fast-check";
import { createWorld } from "../src/index.ts";
import type { SimClient } from "../src/index.ts";
import { applyOp, arbRun } from "./fuzz-ops.ts";

function sectionsOf(c: SimClient): BlockJSON[][] {
  const sections = scriptBody(c.handle.doc()).materialize().content ?? [];
  return sections.map((section) => section.content ?? []);
}

const idOf = (block: BlockJSON | undefined): string => {
  const id = block?.attrs?.id;
  if (typeof id !== "string") throw new RangeError("the block has no id");
  return id;
};

const textOf = (block: BlockJSON): string =>
  (block.content ?? []).map((run) => run.text).join("");

function action(id: string, text: string): BlockJSON {
  return {
    type: "block",
    attrs: { id, type: "action" },
    content: [{ type: "text", text }],
  };
}

function deleteEveryBlockOfFirstSection(c: SimClient): void {
  const ids = (sectionsOf(c)[0] ?? []).map((block) => idOf(block));
  c.write((w) => {
    for (const id of ids) w.deleteBlock(id);
  });
}

function insertBlockAfterFirst(c: SimClient, text: string): void {
  const first = idOf(sectionsOf(c)[0]?.[0]);
  c.write((w) => w.insertBlocks(first, [action("inserted00000001", text)]));
}

test("every character typed is in the script or in Recovered text, whatever the interleaving", async () => {
  await fc.assert(
    fc.asyncProperty(arbRun, async (run) => {
      const world = await createWorld({
        seed: run.seed,
        users: run.users,
        devicesPerUser: run.devices,
        faults: run.faults,
      });
      for (const op of run.ops) applyOp(world, op);
      await world.settle();
      world.check();
    }),
    { numRuns: Number(process.env.MANENT_FUZZ_RUNS ?? 100) },
  );
}, 300_000);

test("a block inserted into a section a peer emptied at the same moment is in its writer's Recovered text", async () => {
  const world = await createWorld({ seed: 1, users: ["dana", "sam"] });
  const [dana, sam] = world.clients;
  if (dana === undefined || sam === undefined) throw new RangeError("two");
  await world.settle();
  dana.online(false);
  sam.online(false);
  deleteEveryBlockOfFirstSection(dana);
  insertBlockAfterFirst(sam, "typed at the same moment");
  dana.online(true);
  sam.online(true);
  await world.settle();
  world.check();
  expect(world.serverText()).not.toContain("typed at the same moment");
  expect(sam.handle.recovered.get().map((r) => r.text)).toEqual([
    "typed at the same moment",
  ]);
});

test("two people move the same scene at once: nothing is lost, and both copies stay until a repair exists", async () => {
  const world = await createWorld({ seed: 2, users: ["dana", "sam"] });
  const [dana, sam] = world.clients;
  if (dana === undefined || sam === undefined) throw new RangeError("two");
  const scene = sectionsOf(dana)[1] ?? [];
  const ids = scene.map((block) => idOf(block));
  const first = idOf(sectionsOf(sam)[0]?.[0]);
  dana.online(false);
  sam.online(false);
  const moveTo = (c: SimClient, after: string | null) =>
    c.write((w) => {
      for (const id of ids) w.deleteBlock(id);
      w.insertBlocks(after, scene);
    });
  moveTo(dana, null);
  moveTo(sam, first);
  dana.online(true);
  sam.online(true);
  await world.settle();
  world.check();
  const lines = world.serverText();
  const copies = scene.map(
    (block) => lines.filter((line) => line === textOf(block)).length,
  );
  expect(copies).toEqual([2, 2, 2]);
});

test("two offline restores of one block, and a paragraph deleted under an editor", async () => {
  const world = await createWorld({ seed: 3, users: ["dana", "sam", "priya"] });
  const [dana, sam, priya] = world.clients;
  if (dana === undefined || sam === undefined || priya === undefined)
    throw new RangeError("three");
  const [restored, deleted] = sectionsOf(dana)[0] ?? [];
  if (restored === undefined || deleted === undefined)
    throw new RangeError("the seed's first scene has three blocks");
  const restoredId = idOf(restored);
  const deletedId = idOf(deleted);
  const earlier = textOf(restored);
  dana.write((w) => w.insertText(restoredId, earlier.length, "[dana:later]"));
  await world.settle();
  dana.online(false);
  sam.online(false);
  for (const c of [dana, sam])
    c.write((w) => {
      w.deleteText(restoredId, 0, Number.MAX_SAFE_INTEGER);
      w.insertText(restoredId, 0, earlier);
    });
  dana.write((w) => w.insertText(deletedId, 0, "[dana:under]"));
  priya.write((w) => w.deleteBlock(deletedId));
  await world.settle();
  dana.online(true);
  sam.online(true);
  await world.settle();
  world.check();
  const kept = dana.handle.recovered
    .get()
    .filter((item) => item.text.includes("[dana:under]"))
    .map((item) => item.cause);
  expect(kept).toEqual(["merge"]);
});
