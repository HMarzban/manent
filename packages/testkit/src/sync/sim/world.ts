// One seeded world: real sync clients and a real sync service over a memory network, memory stores
// and memory storage, moved only by its clock, the service's deferred work and network steps.
import { createRng, seededIdSource } from "@manent/demo";
import type { Rng } from "@manent/demo";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import { createSyncClient, soloLeader } from "@manent/sync-client";
import type { Random, SyncClient } from "@manent/sync-client";
import {
  createFakeClock,
  createFaultyStoreSpace,
  createMemoryNetwork,
} from "@manent/sync-client/testing";
import type { FakeClock, MemoryNetwork } from "@manent/sync-client/testing";
import type { ServerVersions, VersionSet } from "@manent/sync-protocol";
import { DOC, Device, createBooks, markersIn, noteHeld } from "./device.ts";
import type { Books, SimClient } from "./device.ts";
import { firstBroken, isSettled, rebuild, storeFault } from "./invariants.ts";
import { createSimServer } from "./network.ts";
import type { SimServer } from "./network.ts";
import { actOn, seedScript } from "./script.ts";
import type { Tools } from "./script.ts";

export type { SimClient } from "./device.ts";

export interface World {
  readonly seed: number;
  readonly clock: FakeClock;
  readonly network: MemoryNetwork;
  readonly storage: MemoryStorage;
  readonly clients: readonly SimClient[];
  /** One random action of one random client: type a marker, type into a block, delete a block, split, move a scene, go offline or online. */
  act(): void;
  /** Delivers, runs deferred work and advances until nothing is queued, deferred or due and every online client is synced; throws after 100,000 steps. */
  settle(): Promise<void>;
  /** The next commit throws SimulatedCrash (or the server is dropped at once); the service is gone. */
  crashServer(when: "before_commit" | "after_commit" | "now"): void;
  /** A new service over the same storage. */
  startServer(): void;
  /** The lines of the document rebuilt from the log alone. */
  serverText(): string[];
  /** The invariants; throws an Error naming the seed and the first one broken. */
  check(): void;
}

const START_AT = 1_767_225_600_000;
/** Device n's clock runs this far ahead of the world's for an even n, and behind it for an odd one. */
const SKEW_MS = 3 * 86_400_000;
const V1: VersionSet = Object.freeze({
  protocol: 1,
  schema: 1,
  engine: 0,
  table: 0,
});
const MIN_SERVER: VersionSet = Object.freeze({ ...V1, schema: 0 });
const MAX_STEPS = 100_000;
const IDLE_ADVANCE_MS = 1_000;
const FRAME_MS = 16;

const turn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

function randomOf(rng: Rng): Random {
  return {
    next: rng.next,
    clientId: () => rng.int(1, 4_294_967_295),
    bytes: (length) => Uint8Array.from({ length }, () => rng.int(0, 255)),
  };
}

class SimWorld implements World {
  readonly clock: FakeClock;
  readonly network: MemoryNetwork;
  readonly storage: MemoryStorage;
  readonly clients: Device[] = [];
  readonly books: Books = createBooks();
  /** I4, as the devices' stores stood at the end of the last settle. */
  private storeFault: string | null = null;
  private restorePending = false;
  private restored = false;

  constructor(
    readonly seed: number,
    private readonly server: SimServer,
    private readonly tools: Tools,
    parts: { clock: FakeClock; network: MemoryNetwork; storage: MemoryStorage },
  ) {
    this.clock = parts.clock;
    const { network, storage } = parts;
    // sessions that expire close every connection, as the server does
    this.network = {
      ...network,
      refuseSessions(refuse) {
        network.refuseSessions(refuse);
        if (refuse) server.expireSessions();
      },
    };
    // a restored backup is told to the next service
    this.storage = {
      ...storage,
      restore: (snapshot) => {
        storage.restore(snapshot);
        this.restorePending = true;
        this.restored = true;
      },
    };
  }

  act(): void {
    actOn(this.tools.rng.pick(this.clients), this.tools);
  }

  async settle(): Promise<void> {
    // a remote update waits for a frame or the flush fallback, so a calm world advances once more
    let calm = false;
    for (let step = 0; step < MAX_STEPS; step++) {
      await turn();
      if (this.server.runDeferred() || this.network.step()) {
        calm = false;
        continue;
      }
      await turn();
      if (this.network.queued() > 0) continue;
      const settled = this.clients.every((d) => isSettled(this.storage, d));
      if (settled && calm) return this.witness();
      calm = settled;
      this.clock.advance(IDLE_ADVANCE_MS);
    }
    const unsettled = this.clients
      .filter((device) => !isSettled(this.storage, device))
      .map((d) => `${d.device} ${JSON.stringify(d.handle.status.get())}`);
    throw new Error(
      `seed ${this.seed}: the world did not settle in ${MAX_STEPS} steps: ${unsettled.join("; ")}`,
    );
  }

  crashServer(when: "before_commit" | "after_commit" | "now"): void {
    this.server.crash(when);
  }

  startServer(): void {
    this.server.start();
    if (this.restorePending) this.server.restored();
    this.restorePending = false;
  }

  serverText(): string[] {
    return rebuild(this.storage).lines;
  }

  check(): void {
    const broken = firstBroken({
      storage: this.storage,
      devices: this.clients,
      books: this.books,
      restored: this.restored,
      storeFault: this.storeFault,
    });
    if (broken !== null) throw new Error(`seed ${this.seed}: ${broken}`);
  }

  /** Every marker is seen held, and those in a synced document acknowledged; the stores are read. */
  private async witness(): Promise<void> {
    const { books } = this;
    for (const device of this.clients) {
      const markers = markersIn(device.lines());
      noteHeld(books, device, markers);
      if (device.handle.status.get().synced)
        for (const marker of markers)
          if (books.typist.has(marker)) books.acked.add(marker);
    }
    this.storeFault = null;
    for (const device of this.clients)
      this.storeFault ??= await storeFault(device);
  }
}

/** One document, every user an editor; it resolves once every device has synced it. */
export async function createWorld(options: {
  seed: number;
  users: readonly string[];
  devicesPerUser?: number;
  faults?: { duplicate?: number; swap?: number };
  serverVersions?: ServerVersions;
  clientVersions?: (device: string) => VersionSet;
}): Promise<World> {
  const rng = createRng(options.seed);
  const clock = createFakeClock(START_AT);
  const storage = createMemoryStorage({ now: clock.clock.now });
  const network = createMemoryNetwork({ random: rng.next });
  network.faults(options.faults ?? {});
  const versions = options.serverVersions ?? { current: V1, min: V1 };
  const random = rng.next;
  const server = createSimServer({ network, storage, clock, versions, random });
  const ids = seededIdSource(rng);
  seedScript(storage, options.users, versions, ids);
  server.start();
  const parts = { clock, network, storage };
  const world = new SimWorld(options.seed, server, { rng, ids }, parts);
  const perUser = options.devicesPerUser ?? 1;
  const devices = options.users.flatMap((userId) =>
    Array.from({ length: perUser }, (_, n) => ({
      userId,
      device: `${userId}-${n + 1}`,
    })),
  );
  for (const [index, { userId, device }] of devices.entries()) {
    const skew = index % 2 === 0 ? SKEW_MS : -SKEW_MS;
    const store = createFaultyStoreSpace().store(userId);
    const ports = {
      transport: network.transport(userId),
      store,
      leader: soloLeader(device),
      clock: { ...clock.clock, now: () => clock.clock.now() + skew },
      random: randomOf(createRng(rng.int(1, 2_147_483_647))),
      frames: {
        request: (fn: () => void) => clock.clock.schedule(fn, FRAME_MS),
      },
    };
    const own = options.clientVersions?.(device) ?? V1;
    const make = (): SyncClient =>
      createSyncClient({
        userId,
        deviceId: device,
        build: "sim",
        versions: own,
        minServer: MIN_SERVER,
        ports,
      });
    const client = make();
    const handle = await client.open(DOC);
    const opened = { client, handle, versions: own };
    world.clients.push(
      new Device(userId, device, store, make, world.books, opened),
    );
  }
  await world.settle();
  return world;
}
