// A sync service over memory storage and a fake clock, the people who use it, and the messages
// they send.
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import type { Message, VersionSet } from "@manent/sync-protocol";
import { createSyncService } from "../src/index.ts";
import type { SyncService, SyncSettings } from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import type { FakeClock, FakePeer } from "../src/testing/index.ts";
import { DOC, PROJECT } from "./seed.ts";

export const SAM_CLIENT = 1001;
export const DANA_CLIENT = 2002;
export const ANA_CLIENT = 3003;
export const PRIYA_CLIENT = 4004;
export const LEO_CLIENT = 5005;
/** The state vector of an empty document. */
export const EMPTY_VECTOR = new Uint8Array([0]);

const V1: VersionSet = { protocol: 1, schema: 1, engine: 0, table: 0 };

export interface ServiceWorld {
  storage: MemoryStorage;
  clock: FakeClock;
  service: SyncService;
  sam: FakePeer;
  dana: FakePeer;
  ana: FakePeer;
  priya: FakePeer;
  /** Views DOC. */
  leo: FakePeer;
  /** A new service over the same storage, as after a restart, with the same people attached. */
  restart(): void;
}

export type ServiceOptions = Partial<
  Omit<SyncSettings, "storage" | "clock" | "defer" | "ids">
>;

const CLIENTS: Readonly<Record<string, number>> = {
  sam: SAM_CLIENT,
  dana: DANA_CLIENT,
  ana: ANA_CLIENT,
  priya: PRIYA_CLIENT,
  leo: LEO_CLIENT,
};

/** The one client id each person edits with. */
export const clientOf = (peer: FakePeer): number => CLIENTS[peer.userId] ?? 0;

/**
 * Sam owns DOC, a script in PROJECT; Dana, Ana and Priya edit it and Leo views it. Each is attached
 * and has taken nothing yet.
 */
export function createServiceWorld(options: ServiceOptions = {}): ServiceWorld {
  const clock = fakeClock(1_000);
  const storage = createMemoryStorage({ now: () => clock.clock.now() });
  let versionIds = 0;
  const make = (): SyncService =>
    createSyncService({
      storage,
      clock: clock.clock,
      defer: clock.defer,
      ids: () => `version-${++versionIds}`,
      versions: { current: V1, min: V1 },
      ...options,
    });
  const world: ServiceWorld = {
    storage,
    clock,
    service: make(),
    sam: fakePeer(),
    dana: fakePeer({ userId: "dana", name: "Dana Reyes" }),
    ana: fakePeer({ userId: "ana", name: "Ana Costa" }),
    priya: fakePeer({ userId: "priya", name: "Priya Nair" }),
    leo: fakePeer({ userId: "leo", name: "Leo Marsh" }),
    restart() {
      world.service = make();
      for (const peer of people) world.service.attach(peer);
    },
  };
  const people = [world.sam, world.dana, world.ana, world.priya, world.leo];
  world.service.access.create("sam", {
    docId: DOC,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  for (const userId of ["dana", "ana", "priya"])
    storage.directory.setRole(DOC, userId, "edit", []);
  storage.directory.setRole(DOC, "leo", "view", []);
  for (const peer of people) world.service.attach(peer);
  return world;
}

export const subscribe = (
  docId: string,
  mode: "edit" | "view" | "prompter",
  clientIds: number[],
  extra: { lastServerSeq?: number; generation?: number } = {},
): Message => ({
  type: "SUBSCRIBE",
  docId,
  generation: extra.generation ?? 0,
  mode,
  clientIds,
  lastServerSeq: extra.lastServerSeq ?? 0,
});

/** The data of the step 2 among the messages; RangeError when none was sent. */
export function stepTwoOf(messages: readonly Message[]): Uint8Array {
  const found = messages.find(
    (message) => message.type === "SYNC" && message.step === "step2",
  );
  if (found?.type !== "SYNC") throw new RangeError("no step 2 was sent");
  return found.data;
}

export const step1 = (docId: string, data: Uint8Array): Message => ({
  type: "SYNC",
  docId,
  generation: 1,
  step: "step1",
  data,
});

export const push = (
  docId: string,
  clientSeq: number,
  update: Uint8Array,
): Message => ({
  type: "PUSH",
  docId,
  generation: 1,
  clientSeq,
  update,
  heal: false,
});

export const set = (
  docId: string,
  clientSeq: number,
  key: string,
  value: unknown,
): Message => ({
  type: "SET",
  docId,
  generation: 1,
  clientSeq,
  key,
  value: new TextEncoder().encode(JSON.stringify(value)),
});
