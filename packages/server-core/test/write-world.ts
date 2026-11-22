// A write path over memory storage and real rooms, with every port recording what it was asked.
import { scriptBody } from "@manent/crdt";
import type { DocFile, Home, Storage } from "@manent/storage";
import { SimulatedCrash, createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import {
  DEFAULT_LIMITS,
  createInlineCheckpointer,
  createRooms,
  createWritePath,
} from "../src/index.ts";
import type {
  Peer,
  Refusal,
  Room,
  Rooms,
  SettingRules,
  Subscription,
  SyncLimits,
  UpstreamItem,
  WriteMode,
  WritePath,
  WritePathPorts,
} from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import type { FakeClock } from "../src/testing/index.ts";
import { DOC, HOME, placeScript } from "./seed.ts";

export const ALICE_CLIENT = 1001;
export const BOB_CLIENT = 2002;

export type WriteEvent =
  | { type: "commit" }
  | { type: "ack"; peer: Peer; clientSeq: number; serverSeq: number }
  | { type: "refuse"; peer: Peer; refusal: Refusal }
  | { type: "publish"; peer: Peer | null; seq: number; echo: boolean }
  | { type: "poisoned" }
  | { type: "schema_raised"; toVersion: number }
  | { type: "upstream" };

/** Where a simulated crash strikes: at the n-th commit, before or after it, or after the n-th ACK or publish. */
export interface CrashAt {
  step: "before_commit" | "after_commit" | "after_ack" | "after_publish";
  occurrence: number;
}

export interface WriteWorld {
  storage: MemoryStorage;
  clock: FakeClock;
  rooms: Rooms;
  room: Room;
  path: WritePath;
  subA: Subscription;
  subB: Subscription;
  subViewer: Subscription;
  events: WriteEvent[];
  refusals: Refusal[];
  dropped: Room[];
  upstream: UpstreamItem[];
  /** The ACKs since the last call, as client sequences. */
  newAcks(): number[];
}

export interface WorldOptions {
  mode?: WriteMode;
  limits?: Partial<SyncLimits>;
  registry?: SettingRules;
  crashAt?: CrashAt;
  ports?: Partial<WritePathPorts>;
}

const OPEN_BUCKET = { take: () => ({ ok: true as const }) };

/** Records each commit of every file it opens, and arms a crash at the chosen one. */
function recordingStorage(
  storage: MemoryStorage,
  events: WriteEvent[],
  crashAt: CrashAt | null,
): Storage {
  const files = new Map<string, DocFile>();
  let commits = 0;
  const open = (home: Home): DocFile => {
    const key = `${home.kind}:${home.id}`;
    const inner = storage.open(home);
    const file = files.get(key) ?? {
      ...inner,
      transaction<T>(fn: () => T): T {
        commits += 1;
        const crash = crashAt?.occurrence === commits ? crashAt.step : null;
        if (crash === "before_commit") storage.crashOnCommit("before");
        if (crash === "after_commit") storage.crashOnCommit("after");
        const result = inner.transaction(fn);
        events.push({ type: "commit" });
        return result;
      },
    };
    files.set(key, file);
    return file;
  };
  return { directory: storage.directory, open, close: () => storage.close() };
}

function subscriptionOf(peer: Peer, mode: "edit" | "view"): Subscription {
  return {
    peer,
    mode,
    access: { role: mode === "edit" ? "owner" : "view", capabilities: [] },
    stalled: false,
  };
}

/**
 * Sam (subA, ALICE_CLIENT) and Dana (subB, BOB_CLIENT) edit DOC in HOME, which is loaded; Leo
 * views it. `storage` is reused for a world after a restart.
 */
export function createWorld(
  options: WorldOptions = {},
  given?: MemoryStorage,
): WriteWorld {
  const clock = fakeClock(1_000);
  const storage =
    given ?? createMemoryStorage({ now: () => clock.clock.now() });
  const events: WriteEvent[] = [];
  const refusals: Refusal[] = [];
  const dropped: Room[] = [];
  const upstream: UpstreamItem[] = [];
  const crashAt = options.crashAt ?? null;
  const recorded = recordingStorage(storage, events, crashAt);
  if (given === undefined) {
    placeScript(storage);
    storage.directory.setRole(DOC, "dana", "edit", []);
  }
  const file = storage.open(HOME);
  file.log.registerClients(DOC, "sam", [ALICE_CLIENT]);
  file.log.registerClients(DOC, "dana", [BOB_CLIENT]);
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const rooms = createRooms({
    storage: recorded,
    clock: clock.clock,
    limits,
    checkpointer: createInlineCheckpointer({ storage, defer: clock.defer }),
    mode: () => options.mode ?? "authority",
  });
  const room = rooms.room(DOC, HOME, "script");
  rooms.load(room);
  const subA = subscriptionOf(fakePeer(), "edit");
  const subB = subscriptionOf(
    fakePeer({ userId: "dana", name: "Dana Reyes" }),
    "edit",
  );
  const subViewer = subscriptionOf(
    fakePeer({ userId: "leo", name: "Leo Marsh" }),
    "view",
  );
  for (const sub of [subA, subB]) room.editors.set(sub.peer, sub);
  room.viewers.set(subViewer.peer, subViewer);
  const counts = { ack: 0, publish: 0 };
  const strike = (step: CrashAt["step"], count: number): void => {
    if (crashAt?.step === step && crashAt.occurrence === count)
      throw new SimulatedCrash(`crash at ${step} ${count}`);
  };
  const path = createWritePath({
    limits,
    now: clock.clock.now,
    defer: clock.defer,
    rooms: {
      reload: (r) => rooms.reload(r),
      drop: (rs) => {
        dropped.push(...rs);
        rooms.drop(rs);
      },
      changed: (r, bytes) => rooms.changed(r, bytes),
    },
    bucketOf: () => ({ frames: OPEN_BUCKET, bytes: OPEN_BUCKET }),
    ack(peer, _room, clientSeq, serverSeq) {
      events.push({ type: "ack", peer, clientSeq, serverSeq });
      strike("after_ack", ++counts.ack);
    },
    refuse(peer, _room, refusal) {
      refusals.push(refusal);
      events.push({ type: "refuse", peer, refusal });
    },
    publish({ sender, seq, echo }) {
      events.push({ type: "publish", peer: sender, seq, echo });
      strike("after_publish", ++counts.publish);
    },
    poisoned: () => events.push({ type: "poisoned" }),
    schemaRaised: (_room, toVersion) =>
      events.push({ type: "schema_raised", toVersion }),
    admitsForeign: () => false,
    beforeAppend: () => {},
    upstream:
      options.mode === "relay"
        ? {
            enqueue(item) {
              upstream.push(item);
              events.push({ type: "upstream" });
            },
          }
        : null,
    fullDisk: "poison",
    held: { hold() {}, retry() {}, size: () => 0, state: "ok" },
    registry: options.registry ?? {
      check: () => ({ ok: true }),
      isGuarded: () => false,
    },
    schemaFloor: null,
    checkPush: () => [],
    ids: () => "writer",
    copiesKept: () => {},
    ...options.ports,
  });
  let seen = 0;
  return {
    storage,
    clock,
    rooms,
    room,
    path,
    subA,
    subB,
    subViewer,
    events,
    refusals,
    dropped,
    upstream,
    newAcks() {
      const acks = events.flatMap((e) =>
        e.type === "ack" ? [e.clientSeq] : [],
      );
      const fresh = acks.slice(seen);
      seen = acks.length;
      return fresh;
    },
  };
}

/** New rooms and a new write path over the same storage, as after a restart. */
export function restartOn(
  storage: MemoryStorage,
  options: WorldOptions = {},
): WriteWorld {
  return createWorld(options, storage);
}

export const pushOf = (clientSeq: number, update: Uint8Array) => ({
  clientSeq,
  update,
  heal: false,
  generation: 1,
});

export const setOf = (clientSeq: number, key: string, value: unknown) => ({
  clientSeq,
  key,
  value: new TextEncoder().encode(JSON.stringify(value)),
  generation: 1,
});

/** Every block's text, in order. */
export function textOf(room: Room): string {
  if (room.doc === null) return "";
  const sections = scriptBody(room.doc).materialize().content ?? [];
  return sections
    .flatMap((s) => s.content ?? [])
    .map((b) => (b.content ?? []).map((t) => t.text).join(""))
    .join("\n");
}

export const occurrences = (text: string, part: string): number =>
  text.split(part).length - 1;
