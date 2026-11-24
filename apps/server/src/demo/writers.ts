// The simulated writers Add writers starts, each in a scene of its own or all in one, and the members who type in
// Lanternfield Studios.
import { createRng, createSimulatedPerson, writerLines } from "@manent/demo";
import type { WritingProfile } from "@manent/demo";
import type { FlatBlock } from "@manent/schema";
import {
  createMemoryStore,
  createSyncClient,
  soloLeader,
} from "@manent/sync-client";
import type { Clock, DocHandle, Random } from "@manent/sync-client";
import type { LiveTarget } from "../seed/driver.ts";
import { inProcessTransport } from "../seed/link.ts";
import { BUILD_VERSIONS } from "../seed/server.ts";

/** A scene heading and the last block before the next scene heading or act break. */
export interface Scene {
  firstBlockId: string;
  lastBlockId: string;
}

/** One person typing over a sync client of their own; `scene` null types anywhere in the document. */
export interface Writer {
  userId: string;
  scene: Scene | null;
  /** When the person last typed in the script; null before their first keystroke. */
  editedAt(): number | null;
  /**
   * Takes back the lines typed, ends the typing and, once the server has the last changes, the client, so the server
   * records the person's session; a guest role is removed.
   */
  stop(): Promise<void>;
}

const NO_FRAMES = { request: () => () => {} };
/** The elements that end the scene before them: a writer's lines stay in its own act. */
const SCENE_ENDS: ReadonlySet<string> = new Set(["scene_heading", "act_break"]);
const UINT32 = 4_294_967_296;
/**
 * Lines between the starts of two writers seated one after the other, whose seeds follow one another: a prime
 * above any bank's length, so that a group's writers start at distinct lines.
 */
const LINE_STRIDE = 1_009;
/** How long a writer who stops waits for the server to take its last changes before it closes. */
const SETTLE_MS = 5_000;

/** `lines` from the one at `from` round to the one before it. */
const linesFrom = <T>(lines: readonly T[], from: number): T[] => [
  ...lines.slice(from),
  ...lines.slice(0, from),
];

const randomOf = (next: () => number): Random => ({
  next,
  clientId: () => Math.floor(next() * (UINT32 - 1)) + 1,
  bytes: (length) =>
    Uint8Array.from({ length }, () => Math.floor(next() * 256)),
});

/** Resolves once the server has every change made through `handle`, or after SETTLE_MS. */
function settled(handle: DocHandle, clock: Clock): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      unsubscribe();
      cancel();
      resolve();
    };
    const unsubscribe = handle.status.subscribe((s) => {
      if (s.waiting === 0) done();
    });
    const cancel = clock.schedule(done, SETTLE_MS);
    if (handle.status.get().waiting === 0) done();
  });
}

/**
 * The scenes of `blocks` in document order, each ending before the next heading or act break, and the index of the
 * last one starting at or before `afterBlockId`: -1 when it is absent, null, or before the first heading, where
 * blocks belong to no scene.
 */
function scenesAround(
  blocks: readonly FlatBlock[],
  afterBlockId: string | null,
): { scenes: Scene[]; own: number } {
  const ends = blocks.flatMap((b, i) =>
    SCENE_ENDS.has(b.attrs.type) ? [i] : [],
  );
  const idAt = (i: number): string => blocks[i]?.attrs.id ?? "";
  const starts = ends.flatMap((from, k) =>
    blocks[from]?.attrs.type === "scene_heading" ? [{ from, k }] : [],
  );
  const scenes = starts.map(({ from, k }) => ({
    firstBlockId: idAt(from),
    lastBlockId: idAt((ends[k + 1] ?? blocks.length) - 1),
  }));
  const caret = blocks.findIndex((b) => b.attrs.id === afterBlockId);
  const own =
    caret < 0 ? -1 : starts.findLastIndex(({ from }) => from <= caret);
  return { scenes, own };
}

/**
 * The scenes after the one holding `afterBlockId`, in document order and then from the start,
 * without that scene and without those whose heading is in `held`; from the first scene when
 * `afterBlockId` is in no scene.
 */
export function freeScenes(
  blocks: readonly FlatBlock[],
  afterBlockId: string | null,
  held: ReadonlySet<string>,
): Scene[] {
  const { scenes, own } = scenesAround(blocks, afterBlockId);
  return [
    ...scenes.slice(own + 1),
    ...scenes.slice(0, Math.max(own, 0)),
  ].filter((s) => !held.has(s.firstBlockId));
}

/** The scene holding `afterBlockId`, or the first scene when it is in none; null for a script without scenes. */
export function caretScene(
  blocks: readonly FlatBlock[],
  afterBlockId: string | null,
): Scene | null {
  const { scenes, own } = scenesAround(blocks, afterBlockId);
  return scenes[Math.max(own, 0)] ?? null;
}

/**
 * `userId` typing in `scene` of `docId` at `profile`'s rates, its draws seeded by `seed`, over its
 * own client on the live server, keeping at most the blocks `keepBlocks` gives of its own lines in the script.
 * A person with no role on the document is given `edit` as a guest.
 */
export async function startWriter(
  live: LiveTarget,
  options: {
    docId: string;
    userId: string;
    scene: Scene | null;
    profile: WritingProfile;
    seed: number;
    random: () => number;
    keepBlocks: () => number;
  },
): Promise<Writer> {
  const { docId, userId, scene } = options;
  const { directory } = live.storage;
  const guest = directory.roleOf(docId, userId) === null;
  if (guest) directory.setRole(docId, userId, "edit", []);
  const leaveGuestRole = () => {
    if (!guest) return;
    directory.removeRole(docId, userId);
    live.sync.accessChanged(docId, userId);
  };
  const deviceId = `writer-${userId}`;
  const client = createSyncClient({
    userId,
    deviceId,
    build: "demo",
    versions: BUILD_VERSIONS,
    minServer: BUILD_VERSIONS,
    ports: {
      transport: inProcessTransport(live, userId),
      store: createMemoryStore(userId),
      leader: soloLeader(deviceId),
      clock: live.clock,
      random: randomOf(options.random),
      frames: NO_FRAMES,
    },
  });
  try {
    const handle = await client.open(docId);
    const lines = await writerLines(docId);
    const rng = createRng(options.seed);
    const person = createSimulatedPerson({
      handle,
      client,
      profile: options.profile,
      clock: live.clock,
      random: randomOf(rng.next),
      region: scene,
      markers: false,
      keepBlocks: options.keepBlocks,
      // a group's writers start LINE_STRIDE lines apart, so that no two of its scenes open alike
      lines: linesFrom(
        lines,
        ((options.seed % lines.length) * LINE_STRIDE) % lines.length,
      ),
    });
    person.start();
    return {
      userId,
      scene,
      editedAt: () =>
        person.events.findLast((e) => e.type === "typed")?.at ?? null,
      async stop() {
        await person.stop();
        await settled(handle, live.clock);
        await client.close();
        leaveGuestRole();
      },
    };
  } catch (error) {
    await client.close();
    leaveGuestRole();
    throw error;
  }
}
