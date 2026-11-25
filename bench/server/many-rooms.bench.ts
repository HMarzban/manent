// Many rooms open at once: story sets placed in SQLite, 1–5 bots per room, 5 % typing at
// realistic rates, then everyone leaves and the idle timeout unloads every room.
import { heapStats } from "bun:jsc";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserClock, browserRandom } from "@manent/client-web";
import { ORIGIN_REMOTE, loadDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { PROFILES, createRng, createSimulatedPerson } from "@manent/demo";
import type { SimulatedPerson } from "@manent/demo";
import { ENGINE_VERSION, TABLE_VERSION } from "@manent/pagination";
import { SCHEMA_VERSION } from "@manent/schema";
import { DEFAULT_LIMITS, createSyncService } from "@manent/server-core";
import type { Peer, SyncService } from "@manent/server-core";
import { openSqliteStorage } from "@manent/storage";
import type { Storage } from "@manent/storage";
import { PROTOCOL_VERSION } from "@manent/sync-protocol";
import type {
  Message,
  PreparedMessage,
  VersionSet,
} from "@manent/sync-protocol";
import { storySet } from "../corpus/stories.ts";
import type { STORY_SET_ROWS } from "../corpus/stories.ts";
import { benchMode } from "../env.ts";
import type { Measurement, Scenario } from "../harness.ts";
import { measurement } from "../measure.ts";
import {
  EMPTY_VECTOR,
  HOME,
  createBenchPeer,
  delay,
  docIdOf,
  joinAsEditor,
  placeScript,
  stateOf,
} from "./support.ts";

type Mode = ReturnType<typeof benchMode>;
type StoryRows = (typeof STORY_SET_ROWS)[number];

const SEED = 4747;
const SETS: Readonly<Record<Mode, readonly StoryRows[]>> = Object.freeze({
  quick: [20],
  standard: [300, 300, 300, 80, 20],
  full: [300, 300, 300, 80, 20],
});
const TYPING_MS: Readonly<Record<Mode, number>> = Object.freeze({
  quick: 1_000,
  standard: 300_000,
  full: 300_000,
});
const ROOM_IDLE_MS: Readonly<Record<Mode, number>> = Object.freeze({
  quick: 200,
  standard: DEFAULT_LIMITS.roomIdleMs,
  full: DEFAULT_LIMITS.roomIdleMs,
});
const IDLE_GRACE_MS = 250;
const TYPIST_SHARE = 0.05;

const VERSIONS: VersionSet = Object.freeze({
  protocol: PROTOCOL_VERSION,
  schema: SCHEMA_VERSION,
  engine: ENGINE_VERSION,
  table: TABLE_VERSION,
});

interface BotPlan {
  roomIndex: number;
  docId: string;
  userId: string;
  clientId: number;
  typing: boolean;
}

interface ActiveTypist {
  person: SimulatedPerson;
  doc: CrdtDoc;
}

function buildStories(rowsList: readonly StoryRows[]): Uint8Array[] {
  const states: Uint8Array[] = [];
  rowsList.forEach((rows, index) => {
    for (const story of storySet({ rows, seed: SEED + index }))
      states.push(stateOf(story.doc));
  });
  return states;
}

function planBots(roomCount: number): BotPlan[] {
  const rng = createRng(SEED);
  const plans: BotPlan[] = [];
  let clientId = 10;
  for (let roomIndex = 0; roomIndex < roomCount; roomIndex++) {
    const docId = docIdOf(roomIndex);
    const count = rng.int(1, 5);
    for (let k = 0; k < count; k++)
      plans.push({
        roomIndex,
        docId,
        userId: `bot-${roomIndex}-${k}`,
        clientId: clientId++,
        typing: false,
      });
  }
  const typists = Math.max(1, Math.round(plans.length * TYPIST_SHARE));
  const step = Math.max(1, Math.floor(plans.length / typists));
  for (let n = 0; n < typists; n++) {
    const chosen = plans[(n * step) % plans.length];
    if (chosen !== undefined) chosen.typing = true;
  }
  return plans;
}

function connectTypist(
  service: SyncService,
  plan: BotPlan,
  state: Uint8Array,
): { peer: Peer; typist: ActiveTypist } {
  const doc = loadDoc(state, { clientId: plan.clientId });
  let online = true;
  let clientSeq = 0;
  const pending: Uint8Array[] = [];
  const onMessage = (message: Message | PreparedMessage): void => {
    if (message.type === "SYNC" && message.step === "update")
      doc.applyUpdate(message.data, ORIGIN_REMOTE);
  };
  const peer = createBenchPeer(plan.userId, onMessage);
  joinAsEditor(service, peer, {
    docId: plan.docId,
    clientId: plan.clientId,
    vector: doc.encodeStateVector(),
  });
  const push = (update: Uint8Array): void => {
    clientSeq += 1;
    service.receive(peer, {
      type: "PUSH",
      docId: plan.docId,
      generation: 1,
      clientSeq,
      update,
      heal: false,
    });
  };
  doc.subscribe((update, origin) => {
    if (origin === ORIGIN_REMOTE) return;
    if (online) push(update);
    else pending.push(update);
  });
  const person = createSimulatedPerson({
    handle: {
      doc: () => doc,
      sendAwareness(update) {
        if (online)
          service.receive(peer, {
            type: "AWARENESS",
            docId: plan.docId,
            generation: 1,
            update,
          });
      },
    },
    client: {
      setOnline(wanted) {
        online = wanted;
        if (!online) return;
        for (const queued of pending.splice(0)) push(queued);
      },
    },
    profile: PROFILES.realistic,
    clock: browserClock,
    random: browserRandom,
    region: null,
    markers: false,
  });
  return { peer, typist: { person, doc } };
}

function openRoomService(
  storage: Storage,
  roomCount: number,
  connections: number,
  roomIdleMs: number,
): SyncService {
  return createSyncService({
    storage,
    clock: browserClock,
    defer: setImmediate,
    ids: () => crypto.randomUUID(),
    versions: { current: VERSIONS, min: VERSIONS },
    limits: {
      maxLoadedRooms: roomCount + 16,
      roomLoadsPerSecond: Math.max(10_000, roomCount * 2),
      connectionsPerUser: connections + 16,
      connectionsPerAddress: connections + 16,
      roomIdleMs,
    },
  });
}

function memorySnapshot(): { rss: number; heap: number } {
  Bun.gc(true);
  return { rss: process.memoryUsage.rss(), heap: heapStats().heapSize };
}

async function measure(dir: string, mode: Mode): Promise<Measurement[]> {
  const states = buildStories(SETS[mode]);
  const roomCount = states.length;
  const plans = planBots(roomCount);
  const roomIdleMs = ROOM_IDLE_MS[mode];
  const storage = openSqliteStorage({ dir, now: Date.now });
  const service = openRoomService(storage, roomCount, plans.length, roomIdleMs);
  const peers: Peer[] = [];
  const typists: ActiveTypist[] = [];
  try {
    const editorsByRoom = Array.from({ length: roomCount }, (): string[] => []);
    for (const plan of plans) editorsByRoom[plan.roomIndex]!.push(plan.userId);
    for (let r = 0; r < roomCount; r++)
      placeScript(service, storage, {
        docId: docIdOf(r),
        home: HOME,
        state: states[r]!,
        editors: editorsByRoom[r]!,
      });
    const typistStates = new Map<number, Uint8Array>();
    for (const plan of plans)
      if (plan.typing)
        typistStates.set(plan.roomIndex, states[plan.roomIndex]!);
    states.length = 0;
    const before = memorySnapshot();
    for (const plan of plans) {
      if (plan.typing) {
        const connected = connectTypist(
          service,
          plan,
          typistStates.get(plan.roomIndex)!,
        );
        peers.push(connected.peer);
        typists.push(connected.typist);
      } else {
        const peer = createBenchPeer(plan.userId, () => {});
        joinAsEditor(service, peer, {
          docId: plan.docId,
          clientId: plan.clientId,
          vector: EMPTY_VECTOR,
        });
        peers.push(peer);
      }
    }
    typistStates.clear();
    for (const active of typists) active.person.start();
    await delay(TYPING_MS[mode]);
    await Promise.all(typists.map((active) => active.person.stop()));
    for (const active of typists) active.doc.destroy();
    typists.length = 0;
    await delay(50);
    const loaded = service.stats().loadedRooms;
    if (loaded !== roomCount)
      throw new Error(`${loaded} rooms loaded, not ${roomCount}`);
    const after = memorySnapshot();
    for (const peer of peers) service.detach(peer);
    peers.length = 0;
    await delay(roomIdleMs + IDLE_GRACE_MS);
    const afterIdle = service.stats().rooms;
    const rssDelta = Math.max(0, after.rss - before.rss);
    const heapDelta = Math.max(0, after.heap - before.heap);
    return [
      measurement("rss_per_loaded_room_bytes", "bytes", [rssDelta / roomCount]),
      measurement("rss_per_connection_bytes", "bytes", [
        rssDelta / plans.length,
      ]),
      measurement("heap_per_loaded_room_bytes", "bytes", [
        heapDelta / roomCount,
      ]),
      measurement("rooms_after_idle", "count", [afterIdle]),
    ];
  } finally {
    await Promise.all(typists.map((active) => active.person.stop()));
    for (const active of typists) active.doc.destroy();
    for (const peer of peers) service.detach(peer);
    await service.shutdown();
    storage.close();
  }
}

const scenario: Scenario = {
  id: "server.many-rooms",
  workload: null,
  processes: 1,
  async run(): Promise<Measurement[]> {
    const dir = await mkdtemp(join(tmpdir(), "manent-many-rooms-"));
    try {
      return await measure(dir, benchMode());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};

export default scenario;
