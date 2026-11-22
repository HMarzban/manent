import { expect, test } from "bun:test";
import { scriptBody } from "@manent/crdt";
import { createRng } from "@manent/demo";
import { DEFAULT_LIMITS } from "@manent/server-core";
import type { DocFile } from "@manent/storage";
import { createWorld } from "../src/index.ts";
import type { SimClient, World } from "../src/index.ts";

const SEEDS = Number(process.env.MANENT_SIM_SEEDS ?? 25);
const LONG = { timeout: 120_000 };
const QUIET_MS = DEFAULT_LIMITS.rebuildQuietMs;
/** Past the window in which a closed generation's final state is kept. */
const PAST_WINDOW_MS = 7_776_000_001;

const forSeeds = async (
  run: (world: World) => Promise<void>,
  faults = { duplicate: 0 },
) => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const world = await createWorld({
      seed,
      users: ["dana", "sam", "priya"],
      limits: { checkpointEvery: 1 },
      faults,
    });
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

const docIdOf = (w: World): string => clientOf(w, "dana").handle.docId;

function fileOf(w: World): DocFile {
  const place = w.storage.directory.placeOf(docIdOf(w));
  if (place === null) throw new RangeError("the script is not placed");
  return w.storage.open(place.home);
}

const generationOf = (w: World): number =>
  fileOf(w).log.get(docIdOf(w))?.generation ?? 0;

async function storedGeneration(c: SimClient): Promise<number> {
  return (await c.store.load(c.handle.docId))?.meta.generation ?? 0;
}

async function movingKey(c: SimClient): Promise<string | null> {
  return (await c.store.load(c.handle.docId))?.meta.moving?.key ?? null;
}

async function allOnline(w: World): Promise<void> {
  for (const c of w.clients) c.online(true);
  await w.settle();
}

/**
 * Random actions, each synced everywhere before the next: two devices moving one scene at once
 * leave two blocks under one id, and a document holding those is never rebuilt.
 */
async function actInTurn(w: World, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    w.act();
    await allOnline(w);
  }
}

const turn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

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

let said = 0;
/** A new block at the start of the script holding one marker of `c`'s, which is returned. */
function say(c: SimClient): string {
  said += 1;
  const marker = `[${c.device}:said-${said}]`;
  const id = `said${String(said).padStart(12, "0")}`;
  c.write((w) => {
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: { id, type: "action" },
        content: [{ type: "text", text: marker }],
      },
    ]);
  });
  return marker;
}

const sayMany = (c: SimClient, n: number): string[] =>
  Array.from({ length: n }, () => say(c));

/** A marker of `c`'s typed at `at` in the block `id`, which is returned. */
function typeInto(c: SimClient, id: string, at: "start" | "end"): string {
  said += 1;
  const marker = `[${c.device}:typed-${said}]`;
  const block = blocksOf(c).find((b) => b.id === id);
  if (block === undefined) throw new RangeError(`${c.device} has no ${id}`);
  const offset = at === "start" ? 0 : block.text.length;
  c.write((w) => w.insertText(id, offset, marker));
  return marker;
}

/** A marker typed at the end of the script's last block. */
function typeAtEnd(c: SimClient): string {
  const last = blocksOf(c).at(-1);
  if (last === undefined) throw new RangeError(`${c.device} has no block`);
  return typeInto(c, last.id, "end");
}

const recoveredText = (c: SimClient, causes: readonly string[]): string =>
  c.handle.recovered
    .get()
    .filter((item) => causes.includes(item.cause))
    .map((item) => item.text)
    .join("\n");

const missingFrom = (markers: readonly string[], text: string): string[] =>
  markers.filter((m) => !text.includes(m));

const ANY_CAUSE = ["merge", "overlap", "rejected"] as const;

/** The second block of the seed's first scene, which nobody but the test types into. */
function seedBlockOf(c: SimClient): string {
  const block = blocksOf(c)[1];
  if (block === undefined) throw new RangeError("the seed has no scene");
  return block.id;
}

test(
  "a rebuild meets devices with nothing waiting: each reloads and the pages are the same",
  () =>
    forSeeds(async (w) => {
      await actInTurn(w, 60);
      const before = w.serverText();
      w.requestRebuild();
      await w.settle();
      expect(w.rebuilds()).toBe(1);
      expect(w.clients.map(linesOf)).toEqual(w.clients.map(() => before));
      const generations = await Promise.all(w.clients.map(storedGeneration));
      expect(generations).toEqual([2, 2, 2]);
    }),
  LONG,
);

test(
  "edits made offline in untouched blocks are re-applied after a rebuild",
  () =>
    forSeeds(async (w) => {
      const sam = clientOf(w, "sam");
      const others = [clientOf(w, "dana"), clientOf(w, "priya")];
      sam.online(false);
      const words = sayMany(sam, 20);
      for (let i = 0; i < 20; i++) typeAtEnd(others[i % 2]!);
      await w.settle();
      w.requestRebuild();
      await w.settle();
      sam.online(true);
      await w.settle();
      expect(missingFrom(words, w.serverText().join("\n"))).toEqual([]);
    }),
  LONG,
);

test(
  "both sides change one block across a rebuild, and nothing is lost",
  () =>
    forSeeds(async (w) => {
      const sam = clientOf(w, "sam");
      const dana = clientOf(w, "dana");
      const id = seedBlockOf(sam);
      sam.online(false);
      const words = [0, 1, 2].map(() => typeInto(sam, id, "end"));
      // at the end the two sides' changes touch; at the start they do not
      typeInto(dana, id, w.seed % 2 === 0 ? "start" : "end");
      await w.settle();
      w.requestRebuild();
      await w.settle();
      sam.online(true);
      await w.settle();
      const kept = `${w.serverText().join("\n")}\n${recoveredText(sam, ["overlap", "merge"])}`;
      expect(missingFrom(words, kept)).toEqual([]);
    }),
  LONG,
);

test(
  "edits in blocks deleted before the rebuild are kept in Recovered text",
  () =>
    forSeeds(async (w) => {
      const sam = clientOf(w, "sam");
      const dana = clientOf(w, "dana");
      const id = seedBlockOf(sam);
      sam.online(false);
      const words = [0, 1, 2].map(() => typeInto(sam, id, "end"));
      dana.write((writer) => writer.deleteBlock(id));
      await w.settle();
      w.requestRebuild();
      await w.settle();
      sam.online(true);
      await w.settle();
      const text = w.serverText().join("\n");
      expect(words.filter((m) => text.includes(m))).toEqual([]);
      expect(missingFrom(words, recoveredText(sam, ANY_CAUSE))).toEqual([]);
    }),
  LONG,
);

test(
  "a device that slept through three rebuilds replays through each",
  () =>
    forSeeds(async (w) => {
      const sam = clientOf(w, "sam");
      const dana = clientOf(w, "dana");
      sam.online(false);
      const words = sayMany(sam, 5);
      for (let round = 0; round < 3; round++) {
        typeAtEnd(dana);
        w.requestRebuild();
        await w.settle();
      }
      expect(w.rebuilds()).toBe(3);
      sam.online(true);
      await w.settle();
      const kept = `${w.serverText().join("\n")}\n${recoveredText(sam, ANY_CAUSE)}`;
      expect(missingFrom(words, kept)).toEqual([]);
      expect(await storedGeneration(sam)).toBe(4);
    }),
  LONG,
);

/** Steps and turns until `done` holds; throws after `limit` steps. */
async function stepUntil(
  w: World,
  done: () => Promise<boolean>,
  limit = 10_000,
): Promise<void> {
  for (let i = 0; i < limit; i++) {
    if (!w.network.step()) w.clock.advance(1_000);
    await turn();
    if (await done()) return;
  }
  throw new RangeError(`seed ${w.seed}: nothing happened in ${limit} steps`);
}

/** Sam types markers offline, the document is rebuilt, and sam comes back online. */
async function samAfterRebuild(
  w: World,
): Promise<{ sam: SimClient; words: string[] }> {
  const sam = clientOf(w, "sam");
  sam.online(false);
  const words = sayMany(sam, 5);
  w.requestRebuild();
  await w.settle();
  sam.online(true);
  return { sam, words };
}

const timesIn = (marker: string, text: string): number =>
  text.split(marker).length - 1;

test(
  "a replay whose answer is lost is retried and applied once",
  () =>
    forSeeds(async (w) => {
      const { sam, words } = await samAfterRebuild(w);
      let key: string | null = null;
      const committed = async (): Promise<boolean> => {
        key ??= await movingKey(sam);
        return key !== null && fileOf(w).replays.get(docIdOf(w), key) !== null;
      };
      await stepUntil(w, committed);
      w.network.partition(true);
      // while sam is away, dana deletes a block his replay wrote: a second application would bring it back
      sam.online(false);
      for (let i = 0; i < 5; i++) w.network.step();
      w.network.partition(false);
      await w.settle();
      const dana = clientOf(w, "dana");
      const [gone, ...kept] = words;
      const deleted = blocksOf(dana).find((block) => block.text === gone);
      if (deleted === undefined)
        throw new RangeError("dana never saw sam's words");
      dana.write((writer) => writer.deleteBlock(deleted.id));
      await w.settle();
      sam.online(true);
      await w.settle();
      const text = w.serverText().join("\n");
      expect(words.map((m) => timesIn(m, text))).toEqual([
        0,
        ...kept.map(() => 1),
      ]);
      const replayed = fileOf(w)
        .log.tail(docIdOf(w), generationOf(w), 0, { quarantine: false })
        .rows.filter((row) => row.origin === "replay");
      expect(replayed.map((row) => row.userId)).toEqual(["sam"]);
    }),
  LONG,
);

test(
  "a rebuild while a device's replay is in flight carries the replay to the newest generation",
  () =>
    forSeeds(async (w) => {
      const { sam, words } = await samAfterRebuild(w);
      let key: string | null = null;
      await stepUntil(w, async () => {
        key = await movingKey(sam);
        return key !== null;
      });
      for (let i = 0; i < 5; i++) await turn();
      w.requestRebuild();
      w.clock.advance(QUIET_MS);
      expect(w.rebuilds()).toBe(2);
      await w.settle();
      if (key === null) throw new RangeError("sam stored no key");
      const stored = fileOf(w).replays.get(docIdOf(w), key);
      expect(stored?.generation).toBe(3);
      expect(missingFrom(words, w.serverText().join("\n"))).toEqual([]);
    }),
  LONG,
);

test(
  "a device back after ninety days keeps its work as a recovered version",
  () =>
    forSeeds(async (w) => {
      const sam = clientOf(w, "sam");
      sam.online(false);
      const words = sayMany(sam, 5);
      w.requestRebuild();
      await w.settle();
      w.clock.advance(PAST_WINDOW_MS);
      sam.online(true);
      await w.settle();
      const versions = (await sam.store.versions(docIdOf(w))).filter(
        (version) => version.label === "past_window",
      );
      const kept = JSON.stringify(versions.map((version) => version.content));
      expect(versions.map((version) => version.kind)).toEqual(["recovered"]);
      expect(missingFrom(words, kept)).toEqual([]);
      const text = w.serverText().join("\n");
      expect(words.filter((m) => text.includes(m))).toEqual([]);
    }),
  LONG,
);

test(
  "the server crashes during a rebuild, before or after its commit, and nothing acknowledged is lost",
  () =>
    forSeeds(async (w) => {
      for (const when of ["before_commit", "after_commit"] as const) {
        await actInTurn(w, 40);
        const before = generationOf(w);
        w.requestRebuild();
        w.crashServer(when);
        w.clock.advance(QUIET_MS);
        w.startServer();
        await w.settle();
        w.check();
        const moved = when === "before_commit" ? before : before + 1;
        expect(generationOf(w)).toBe(moved);
      }
    }),
  LONG,
);

test(
  "random editing with rebuilds at random quiet moments converges and loses nothing",
  () =>
    forSeeds(
      async (w) => {
        const rng = createRng(w.seed);
        for (let i = 0; i < 300; i++) {
          const roll = rng.next();
          if (roll < 0.02) w.requestRebuild();
          else if (roll < 0.04) w.clock.advance(QUIET_MS);
          else w.act();
          if (i % 7 === 0) await w.settle();
        }
      },
      { duplicate: 0.05 },
    ),
  LONG,
);
