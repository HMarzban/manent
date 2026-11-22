import { expect, test } from "bun:test";
import { scriptBody } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import type { SimClient, World } from "../src/index.ts";
import {
  answered,
  contentOf,
  historyWorld,
  nameDraft,
  requestRestore,
  restoreAs,
  restoreLocally,
} from "./history-world.ts";
import type { HistoryWorld } from "./history-world.ts";

const SEEDS = Number(process.env.MANENT_SIM_SEEDS ?? 25);
const LONG = { timeout: 300_000 };
/** Text typed after a draft is named; it holds no marker, so taking it out loses nothing. */
const LATER = "Later words. ";

const forSeeds = async (run: (world: HistoryWorld) => Promise<void>) => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const world = await historyWorld(seed);
    await run(world);
    await world.settle();
    world.check();
  }
};

function clientOf(w: World, userId: string): SimClient {
  const found = w.clients.find((c) => c.userId === userId);
  if (found === undefined) throw new RangeError(`no client of ${userId}`);
  return found;
}

interface Block {
  id: string;
  text: string;
}

function blocksOf(c: SimClient): Block[] {
  const sections = scriptBody(c.handle.doc()).materialize().content ?? [];
  return sections
    .flatMap((section) => section.content ?? [])
    .map((block) => ({
      id: String(block.attrs?.id),
      text: (block.content ?? []).map((run) => run.text).join(""),
    }));
}

const linesOf = (c: SimClient): string[] => blocksOf(c).map((b) => b.text);

/** The script of a device that holds what it has not sent; nothing for a synced one. */
const unsentLines = (c: SimClient): string[] =>
  c.handle.status.get().synced ? [] : linesOf(c);

/**
 * Markers typed and never removed that are in neither the script, any device's Recovered text,
 * nor the script of a device still holding them unsent.
 */
function lostCharacters(w: World): number {
  const kept = [
    ...w.serverText(),
    ...w.clients.flatMap((c) => c.handle.recovered.get().map((r) => r.text)),
    ...w.clients.flatMap(unsentLines),
  ].join("\n");
  const removed = w.removed();
  return w.clients
    .flatMap((c) => c.typed)
    .filter((marker) => !removed.has(marker) && !kept.includes(marker)).length;
}

async function allOnline(w: World): Promise<void> {
  for (const c of w.clients) c.online(true);
  await w.settle();
}

/** Random actions, each synced everywhere before the next, so no two blocks share an id. */
async function actInTurn(w: World, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    w.act();
    await allOnline(w);
  }
}

/** LATER at the start of every block `c` holds, and as a block of its own at the start of the script. */
function writeLater(c: SimClient): void {
  const ids = blocksOf(c).map((b) => b.id);
  const block: BlockJSON = {
    type: "block",
    attrs: { id: "later-block", type: "action" },
    content: [{ type: "text", text: LATER }],
  };
  c.write((writer) => {
    for (const id of ids) writer.insertText(id, 0, LATER);
    writer.insertBlocks(null, [block]);
  });
}

function blockAt(c: SimClient, index: number): Block {
  const block = blocksOf(c)[index];
  if (block === undefined)
    throw new RangeError(`${c.device} has no block ${index}`);
  return block;
}

test(
  "a restore meeting an offline writer conserves every character",
  () =>
    forSeeds(async (w) => {
      for (let i = 0; i < 60; i++) w.act();
      await w.settle();
      const v = await nameDraft(w, "dana", "Table read draft");
      const [, sam] = w.clients;
      if (sam === undefined) throw new RangeError("a world of three");
      sam.online(false);
      for (let i = 0; i < 40; i++) w.act();
      await restoreAs(w, "dana", v, { kind: "script" });
      sam.online(true);
      await w.settle();
      w.check();
      expect(lostCharacters(w)).toBe(0);
    }),
  LONG,
);

test(
  "a scene restore and a whole-script restore at the same moment converge, and both reverses exist",
  () =>
    forSeeds(async (w) => {
      const dana = clientOf(w, "dana");
      const named = w.serverText();
      const v = await nameDraft(w, "dana", "First draft");
      const heading = blockAt(dana, 0).id;
      writeLater(dana);
      dana.write((writer) => writer.deleteBlock(blockAt(dana, 6).id));
      await w.settle();
      const scene = requestRestore(w, "dana", v, {
        kind: "scene",
        headingId: heading,
      });
      const script = requestRestore(w, "sam", v, { kind: "script" });
      const reverses = [await answered(w, scene), await answered(w, script)];
      await w.settle();
      expect(w.serverText()).toEqual(named);
      expect(w.clients.map(linesOf)).toEqual(w.clients.map(() => named));
      const list = w.history.list("priya", w.docId, null, 500);
      const { versions } = await answered(w, list);
      const before = versions.filter((item) => item.kind === "pre_restore");
      expect(before.map((item) => item.id).toSorted()).toEqual(
        reverses.toSorted(),
      );
      expect(before.map((item) => item.createdByUserId).toSorted()).toEqual([
        "dana",
        "sam",
      ]);
    }),
  LONG,
);

// pins today's behaviour: one block id held twice is tolerated until a repair exists
test(
  "two people restoring different versions offline keep both copies until a repair exists",
  () =>
    forSeeds(async (w) => {
      const dana = clientOf(w, "dana");
      const sam = clientOf(w, "sam");
      const seeded = w.serverText();
      const v1 = await nameDraft(w, "dana", "First draft");
      dana.write((writer) => writer.insertText(blockAt(dana, 1).id, 0, LATER));
      await w.settle();
      const v2 = await nameDraft(w, "dana", "Second draft");
      dana.write((writer) => writer.deleteBlock(blockAt(dana, 2).id));
      await w.settle();
      const older = await contentOf(w, "dana", v1);
      const newer = await contentOf(w, "sam", v2);
      dana.online(false);
      sam.online(false);
      await restoreLocally(w, dana, older);
      await restoreLocally(w, sam, newer);
      await allOnline(w);
      // the block both restores put back, twice, under one id
      const twice = seeded.toSpliced(3, 0, ...seeded.slice(2, 3));
      expect(w.serverText()).toEqual(twice);
      expect(w.clients.map(linesOf)).toEqual(w.clients.map(() => twice));
    }),
  LONG,
);

test(
  "a restore across a rebuild restores the version's text",
  () =>
    forSeeds(async (w) => {
      await actInTurn(w, 20);
      const dana = clientOf(w, "dana");
      const named = w.serverText();
      const v = await nameDraft(w, "dana", "Table read draft");
      writeLater(dana);
      const last = blocksOf(dana).at(-1);
      if (last !== undefined)
        dana.write((writer) => writer.deleteBlock(last.id));
      await w.settle();
      w.requestRebuild();
      await w.settle();
      expect(w.rebuilds()).toBe(1);
      await restoreAs(w, "dana", v, { kind: "script" });
      await w.settle();
      expect(w.serverText()).toEqual(named);
      expect(w.clients.map(linesOf)).toEqual(w.clients.map(() => named));
    }),
  LONG,
);
