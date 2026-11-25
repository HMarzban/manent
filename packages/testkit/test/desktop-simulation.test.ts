import { expect, test } from "bun:test";
import type { MemoryStorage } from "@manent/storage/testing";
import { createDesktopWorld } from "../src/index.ts";
import type { DesktopWorld } from "../src/index.ts";

const SEEDS = Number(process.env.MANENT_SIM_SEEDS ?? 25);
const LONG = { timeout: 120_000 };

const forDesktopSeeds = async (
  person: "you" | "sam",
  run: (world: DesktopWorld) => Promise<void>,
  options: { collaborators?: readonly string[] } = {},
) => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const world = await createDesktopWorld({ seed, person, ...options });
    await run(world);
    await world.settle();
    world.check();
  }
};

test(
  "You writes, signs in to sync, and the script is adopted under You",
  () =>
    forDesktopSeeds("you", async (w) => {
      for (let i = 0; i < 200; i++) w.act();
    }),
  LONG,
);

test(
  "killed at random, the desktop loses nothing it acknowledged",
  () =>
    forDesktopSeeds("you", async (w) => {
      for (const when of ["before_commit", "after_commit", "now"] as const) {
        for (let i = 0; i < 40; i++) w.act();
        w.crashNode(when);
        await w.restartNode();
      }
    }),
  LONG,
);

test(
  "a signed-in person writes on and off the network and nothing acknowledged is lost",
  () =>
    forDesktopSeeds(
      "sam",
      async (w) => {
        for (let i = 0; i < 300; i++) {
          w.act();
          if (i % 13 === 0) await w.settle();
        }
      },
      { collaborators: ["dana"] },
    ),
  LONG,
);

/** The action after which the node is killed, and how. */
const CRASHES = new Map<number, "before_commit" | "after_commit" | "now">([
  [100, "before_commit"],
  [200, "after_commit"],
  [250, "now"],
]);

const failingThroughout = async (w: DesktopWorld) => {
  for (let i = 0; i < 300; i++) {
    w.act();
    if (i % 13 === 0) await w.settle();
    const when = CRASHES.get(i);
    if (when === undefined) continue;
    w.crashNode(when);
    await w.restartNode();
  }
};

test(
  "You signs in to sync while the network, the disk and the node fail, and the script is adopted once",
  () => forDesktopSeeds("you", failingThroughout),
  LONG,
);

/** One seed of the runs above, kept by name since it once broke an invariant. */
const atSeed = async (
  seed: number,
  person: "you" | "sam",
  run: (world: DesktopWorld) => Promise<void>,
  options: { collaborators?: readonly string[] } = {},
) => {
  const world = await createDesktopWorld({ seed, person, ...options });
  await run(world);
  await world.settle();
  world.check();
};

const onAndOff = async (w: DesktopWorld) => {
  for (let i = 0; i < 300; i++) {
    w.act();
    if (i % 13 === 0) await w.settle();
  }
};

const killedThrice = async (w: DesktopWorld) => {
  for (const when of ["before_commit", "after_commit", "now"] as const) {
    for (let i = 0; i < 40; i++) w.act();
    w.crashNode(when);
    await w.restartNode();
  }
};

const withDana = { collaborators: ["dana"] };

test("Synced on the desktop waits until the cloud holds the edit", () =>
  atSeed(3, "sam", onAndOff, withDana));

test("a follow put off by a full disk does not run again once another follow has moved the room", () =>
  atSeed(4, "sam", onAndOff, withDana));

test("words a collaborator types at the cloud while the desktop relays are kept", () =>
  atSeed(2, "sam", onAndOff, withDana));

test("words a collaborator types into a block the desktop deletes are kept in her Recovered text", () =>
  atSeed(5, "sam", onAndOff, withDana));

test("a follow of the cloud never doubles text", () =>
  atSeed(31, "sam", onAndOff, withDana));

test("what the node acknowledged is kept while it relays", () =>
  atSeed(44, "sam", onAndOff, withDana));

test("the desktop's owner keeps access while the cloud moves the script", () =>
  atSeed(1, "sam", onAndOff, withDana));

test("after a push the cloud refused for good, the desktop syncs again", () =>
  atSeed(15, "sam", onAndOff, withDana));

test("a hand-off cut short by a restart goes through after it", () =>
  atSeed(20, "you", killedThrice));

test("words the window typed survive the node's restarts", () =>
  atSeed(9, "you", killedThrice));

test("a setting held by a full disk before Sign in to sync never reaches the cloud as a push it refuses", () =>
  atSeed(4, "you", failingThroughout));

test("words a collaborator types into a block the desktop had deleted are kept when the desktop's edits are replayed", () =>
  atSeed(9, "sam", onAndOff, withDana));

test("a replay the node took is kept when the node follows the cloud", () =>
  atSeed(14, "sam", onAndOff, withDana));

test("a replay of an edit the cloud already holds never doubles it", () =>
  atSeed(1, "you", failingThroughout));

test("words a collaborator types into a block the desktop had deleted are kept when a replay catches up through them", () =>
  atSeed(34, "sam", onAndOff, withDana));

test("words a collaborator types into a block the desktop deletes unseen survive relay into her Recovered text", () =>
  atSeed(13, "sam", onAndOff, withDana));

test("a rejected-push recovery interrupted by a full disk and node crash never doubles text", () =>
  atSeed(14, "you", failingThroughout));

/** Every row of every generation of every document the storage holds. */
function rowsOf(storage: MemoryStorage) {
  const { directory } = storage;
  return directory.homes().flatMap((home) =>
    directory.documentsIn(home).flatMap((docId) => {
      const { log } = storage.open(home);
      const generations = log.get(docId)?.generation ?? 0;
      return Array.from(
        { length: generations },
        (_, i) => log.tail(docId, i + 1, 0, { quarantine: false }).rows,
      );
    }),
  );
}

/** Both storages' backup handles and every row of their logs after one run of seed 4747. */
const seededRun = async () => {
  const w = await createDesktopWorld({ seed: 4747, person: "you" });
  for (let i = 0; i < 150; i++) w.act();
  await w.settle();
  const { cloudStorage, nodeStorage } = w;
  return [
    cloudStorage.snapshot(),
    rowsOf(cloudStorage),
    nodeStorage.snapshot(),
    rowsOf(nodeStorage),
  ];
};

test(
  "the same seed gives the same run, byte for byte",
  async () => {
    expect(await seededRun()).toEqual(await seededRun());
  },
  LONG,
);
