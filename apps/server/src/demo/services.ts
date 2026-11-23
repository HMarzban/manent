// What the demo bar's controls do on the live server: writers, the Tour's preparations and Reorganise.
import {
  DEMO_SEED,
  GENERATED_MEMBERS,
  PROFILES,
  SEED_DOCS,
  TOUR,
  docPath,
  seedDoc,
  seedProject,
} from "@manent/demo";
import type { SeedTime, WritingProfile } from "@manent/demo";
import type {
  DemoControls,
  WritersRequest,
  WritersResponse,
} from "@manent/sync-protocol";
import { indexDocId } from "@manent/sync-protocol";
import type { LiveTarget } from "../seed/driver.ts";
import { readServerScript } from "../seed/page-meter.ts";
import { createPreparations } from "./prepare.ts";
import { freeScenes, startWriter } from "./writers.ts";
import type { Scene, Writer } from "./writers.ts";

/** A group of writers stops by itself this long after it starts. */
const WRITERS_RUN_MS = 600_000;

/** Lanternfield Studios' members typing now, slowly: the document and who types in it, one scene each. */
const PRESENCE_GROUPS: readonly (readonly [string, readonly string[]])[] = [
  ["heavy/h24/406", ["Yusuf Demirel", "Niamh Corrigan"]],
  ["heavy/h25/305", ["Fenella Pryce", "Callum Rafferty", "Leilani Kahale"]],
  ["heavy/h30/segments/10", ["Hugo Marchetti", "Zainab Kamara", "Noor Haddad"]],
  ["heavy/h31/stories/16", ["Nadia Petrenko", "Joaquín Ibarra"]],
];

const PRESENCE_PROFILE = Object.freeze({ ...PROFILES.demo, keysPerSecond: 1 });

const WRITER_POOL = GENERATED_MEMBERS.filter((m) => m.writerPool);

const NONE: WritersResponse = Object.freeze({
  asked: 0,
  count: 0,
  names: [],
  endsAt: null,
});

interface Running {
  docId: string;
  writers: readonly Writer[];
}

/** An Add writers group: its writers, what the server answered when it started and the timer that stops it. */
interface Group extends Running {
  answer: WritersResponse;
  cancel(): void;
}

/** What the services keep while the server runs. */
interface Live {
  live: LiveTarget;
  random: () => number;
  /** Add writers' groups, by document. */
  groups: Map<string, Group>;
  presence: Running[];
}

function memberNamed(name: string): string {
  const member = GENERATED_MEMBERS.find((m) => m.name === name);
  if (member === undefined) throw new RangeError(`no member named ${name}`);
  return member.userId;
}

const isHeavyAdopted = ({ live }: Live): boolean =>
  live.storage.directory.placeOf(indexDocId("workspace", "heavy")) !== null;

const runningOn = (state: Live, docId: string): Writer[] =>
  [...state.presence, ...state.groups.values()]
    .filter((r) => r.docId === docId)
    .flatMap((r) => r.writers);

/** The scenes of the document no running writer holds, in the order writers are given them. */
function scenesFor(
  state: Live,
  docId: string,
  afterBlockId: string | null,
): Scene[] {
  const held = new Set(
    runningOn(state, docId).flatMap((w) => w.scene?.firstBlockId ?? []),
  );
  const { flat } = readServerScript(state.live.storage, docId);
  return freeScenes(flat, afterBlockId, held);
}

/**
 * Each seat's person typing in its scene; the n-th draws from DEMO_SEED, n and the moment they
 * start. When one cannot open, the ones that did are stopped before the failure is passed on.
 */
async function seat(
  state: Live,
  docId: string,
  seats: readonly { userId: string; scene: Scene | null }[],
  profile: WritingProfile,
): Promise<Writer[]> {
  const startedAt = state.live.clock.now();
  const opened = await Promise.allSettled(
    seats.map(({ userId, scene }, i) =>
      startWriter(state.live, {
        docId,
        userId,
        scene,
        profile,
        seed: DEMO_SEED + i + startedAt,
        random: state.random,
      }),
    ),
  );
  const writers = opened.flatMap((r) =>
    r.status === "fulfilled" ? [r.value] : [],
  );
  const failed = opened.find(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  if (failed === undefined) return writers;
  await Promise.allSettled(writers.map((w) => w.stop()));
  throw failed.reason;
}

async function stopGroup(state: Live, docId: string): Promise<void> {
  const group = state.groups.get(docId);
  if (group === undefined) return;
  state.groups.delete(docId);
  group.cancel();
  await Promise.all(group.writers.map((w) => w.stop()));
}

/** Replaces the document's group with `count` writers, the first free members of the pool, one a scene. */
async function addWriters(
  state: Live,
  { docId, count, afterBlockId }: WritersRequest,
  stopLater: () => void,
): Promise<WritersResponse> {
  await stopGroup(state, docId);
  if (count === 0) return NONE;
  const busy = new Set(runningOn(state, docId).map((w) => w.userId));
  const scenes = scenesFor(state, docId, afterBlockId).slice(0, count);
  const seats = WRITER_POOL.filter((m) => !busy.has(m.userId))
    .slice(0, scenes.length)
    .map(({ userId, name }, i) => ({ userId, name, scene: scenes[i]! }));
  const writers = await seat(state, docId, seats, PROFILES.demo);
  const cancel = state.live.clock.schedule(stopLater, WRITERS_RUN_MS);
  const answer = {
    asked: count,
    count: writers.length,
    names: seats.map((s) => s.name),
    endsAt: state.live.clock.now() + WRITERS_RUN_MS,
  };
  state.groups.set(docId, { docId, writers, answer, cancel });
  return answer;
}

/** Lanternfield Studios' co-editing groups, on each of their documents that is placed. */
async function startPresenceGroups(state: Live): Promise<void> {
  for (const [key, names] of PRESENCE_GROUPS) {
    const { docId } = seedDoc(key);
    if (state.live.storage.directory.placeOf(docId) === null) continue;
    const scenes = scenesFor(state, docId, null);
    const seats = names.map((name, i) => ({
      userId: memberNamed(name),
      scene: scenes[i] ?? null,
    }));
    const writers = await seat(state, docId, seats, PRESENCE_PROFILE);
    state.presence.push({ docId, writers });
  }
}

/** Whether the scenario opens a document of Lanternfield Studios before it is adopted. */
function isSeeding(state: Live, open: string): boolean {
  const doc = SEED_DOCS.find((d) => docPath(d.key) === open);
  if (doc === undefined) return false;
  const heavy = seedProject(doc.projectKey).workspaceId === "heavy";
  return heavy && !isHeavyAdopted(state);
}

/**
 * The demo bar's controls over the live server. `startPresence` starts Lanternfield Studios'
 * co-editing groups once it is adopted (before that it does nothing); `close` stops every group.
 */
export function createDemoServices(options: {
  live: LiveTarget;
  time: () => SeedTime;
  random: () => number;
}): DemoControls & { startPresence(): Promise<void>; close(): Promise<void> } {
  const { live, random } = options;
  const state: Live = { live, random, groups: new Map(), presence: [] };
  const prepare = createPreparations({ live, random });
  let presenceStarted = false;
  // one change of writers at a time, so two quick choices never start two groups on one script
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn);
    // the caller hears the failure through `run`; the queue only waits for it
    queue = run.catch(() => {});
    return run;
  };
  return {
    writers: (_userId, request) =>
      serial(() =>
        addWriters(state, request, () => {
          // a group whose writers cannot all stop has nothing more to stop
          serial(() => stopGroup(state, request.docId)).catch(() => {});
        }),
      ),
    runningWriters: async (_userId, docId) =>
      state.groups.get(docId)?.answer ?? NONE,
    async prepare(_userId, { scenarioId }) {
      const scenario = TOUR.scenarios.find((s) => s.id === scenarioId);
      if (scenario === undefined) return { ok: false, reason: "unknown" };
      if (isSeeding(state, scenario.setup.open))
        return { ok: false, reason: "seeding" };
      return prepare(scenario.setup.prepare, options.time());
    },
    async rebuild(_userId, docId) {
      live.sync.requestRebuild(docId);
    },
    startPresence: () =>
      serial(async () => {
        if (presenceStarted || !isHeavyAdopted(state)) return;
        presenceStarted = true;
        await startPresenceGroups(state);
      }),
    close: () =>
      serial(async () => {
        const groups = [...state.groups.keys()].map((docId) =>
          stopGroup(state, docId),
        );
        const writers = state.presence.splice(0).flatMap((r) => r.writers);
        await Promise.all([...groups, ...writers.map((w) => w.stop())]);
      }),
  };
}
