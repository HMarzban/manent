// The simulated writers Add writers starts, each in a scene of its own, and the members who type in Lanternfield Studios.
import { createRng, createSimulatedPerson, writerLines } from "@manent/demo";
import type { WritingProfile } from "@manent/demo";
import type { FlatBlock } from "@manent/schema";
import {
  createMemoryStore,
  createSyncClient,
  soloLeader,
} from "@manent/sync-client";
import type { Random } from "@manent/sync-client";
import type { LiveTarget } from "../seed/driver.ts";
import { inProcessTransport } from "../seed/link.ts";
import { BUILD_VERSIONS } from "../seed/server.ts";

/** A scene heading and the last block before the next one. */
export interface Scene {
  firstBlockId: string;
  lastBlockId: string;
}

/** One person typing over a sync client of their own; `scene` null types anywhere in the document. */
export interface Writer {
  userId: string;
  scene: Scene | null;
  /** Ends the typing and the client, so the server records the person's session; a guest role is removed. */
  stop(): Promise<void>;
}

const NO_FRAMES = { request: () => () => {} };
const UINT32 = 4_294_967_296;

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

/**
 * The scenes after the one holding `afterBlockId`, in document order and then from the start,
 * without that scene and without those whose heading is in `held`. Blocks before the first heading
 * belong to no scene; an `afterBlockId` there, absent or null, starts from the first scene.
 */
export function freeScenes(
  blocks: readonly FlatBlock[],
  afterBlockId: string | null,
  held: ReadonlySet<string>,
): Scene[] {
  const starts = blocks.flatMap((b, i) =>
    b.attrs.type === "scene_heading" ? [i] : [],
  );
  const idAt = (i: number): string => blocks[i]?.attrs.id ?? "";
  const scenes = starts.map((from, n) => ({
    from,
    firstBlockId: idAt(from),
    lastBlockId: idAt((starts[n + 1] ?? blocks.length) - 1),
  }));
  const caret = blocks.findIndex((b) => b.attrs.id === afterBlockId);
  const own = caret < 0 ? -1 : scenes.findLastIndex((s) => s.from <= caret);
  return [...scenes.slice(own + 1), ...scenes.slice(0, Math.max(own, 0))]
    .filter((s) => !held.has(s.firstBlockId))
    .map(({ firstBlockId, lastBlockId }) => ({ firstBlockId, lastBlockId }));
}

/**
 * `userId` typing in `scene` of `docId` at `profile`'s rates, its draws seeded by `seed`, over its
 * own client on the live server. A person with no role on the document is given `edit` as a guest.
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
      // each writer starts at a line drawn from its seed, so that a group does not all type the same line;
      // a document no bank writes gets the person's own seeded words
      ...(lines === null
        ? {}
        : { lines: linesFrom(lines, rng.int(0, lines.length - 1)) }),
    });
    person.start();
    return {
      userId,
      scene,
      async stop() {
        await person.stop();
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
