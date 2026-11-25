// One node process of the desktop world, and its link to the cloud: what dies with the process,
// and the calls and sockets that a cut of the node's network loses.
import { createDemoDirectory, createDemoSignIn, createRng } from "@manent/demo";
import type { Rng } from "@manent/demo";
import { createNodeCore } from "@manent/local-node";
import type { CloudApi, NodeCore, NodeRecords } from "@manent/local-node";
import { SCHEMA_VERSION } from "@manent/schema";
import { PRODUCT_SETTING_RULES } from "@manent/server-core";
import type { DocFile, Storage } from "@manent/storage";
import { SimulatedCrash } from "@manent/storage/testing";
import {
  ConnectError,
  createSyncClient,
  soloLeader,
} from "@manent/sync-client";
import type {
  Clock,
  LocalStore,
  Random,
  SyncClient,
  Transport,
} from "@manent/sync-client";
import type {
  FakeClock,
  MemoryNetwork,
  MemoryStoreSpace,
} from "@manent/sync-client/testing";
import { CODE, createFrameDecoder } from "@manent/sync-protocol";
import type { VersionSet } from "@manent/sync-protocol";

export const V1: VersionSet = Object.freeze({
  protocol: 1,
  schema: SCHEMA_VERSION,
  engine: 0,
  table: 0,
});
export const VERSIONS = Object.freeze({ current: V1, min: V1 });
const MIN_SERVER: VersionSet = Object.freeze({ ...V1, schema: 0 });
const FRAME_MS = 16;
export const NODE_URL = "http://127.0.0.1:5197";
export const LAUNCH = "a".repeat(64);

const never = <T>(): Promise<T> => new Promise<T>(() => {});

/** A random source of its own, seeded from `rng`. */
export function randomFrom(rng: Rng): Random {
  const own = createRng(rng.int(1, 2_147_483_647));
  return {
    next: own.next,
    clientId: () => own.int(1, 4_294_967_295),
    bytes: (length) => Uint8Array.from({ length }, () => own.int(0, 255)),
  };
}

/** A person's sync client in the world; `via` "local_node" for the window. */
export function createSimClient(options: {
  userId: string;
  deviceId: string;
  transport: Transport;
  store: LocalStore;
  clock: Clock;
  random: Random;
  via?: "local_node";
}): SyncClient {
  const { userId, deviceId, clock, via } = options;
  return createSyncClient({
    userId,
    deviceId,
    build: "sim",
    versions: V1,
    minServer: MIN_SERVER,
    ...(via === undefined ? {} : { via }),
    ports: {
      transport: options.transport,
      store: options.store,
      leader: soloLeader(deviceId),
      clock,
      random: options.random,
      frames: { request: (fn) => clock.schedule(fn, FRAME_MS) },
    },
  });
}

/** One node process, until it dies: its timers, deferred work and open links end with it. */
export class NodeLife {
  alive = true;
  readonly deferred: (() => void)[] = [];
  /** Closers of the window's sockets and requests, and of the upstream links to the cloud. */
  readonly wires = new Set<() => void>();
  readonly links = new Set<() => void>();
  readonly clock: Clock;

  constructor(fake: FakeClock) {
    this.clock = {
      now: fake.clock.now,
      schedule: (fn, delayMs) =>
        fake.clock.schedule(() => this.run(fn), delayMs),
    };
  }

  readonly defer = (fn: () => void): void => {
    if (this.alive) this.deferred.push(fn);
  };

  /** Work of this process; a crash in it has already ended the process. */
  run(work: () => void): void {
    if (!this.alive) return;
    try {
      work();
    } catch (error) {
      if (!(error instanceof SimulatedCrash)) throw error;
    }
  }

  /** A storage call: a dead process makes none, and one that crashes ends it. */
  during<T>(call: () => T): T {
    if (!this.alive) throw new SimulatedCrash("the node is down");
    try {
      return call();
    } catch (error) {
      if (error instanceof SimulatedCrash) this.die();
      throw error;
    }
  }

  /** What a dead process was waiting for never comes. */
  hold<T>(promise: Promise<T>): Promise<T> {
    return promise.then(
      (value) => (this.alive ? value : never<T>()),
      (error: unknown) => (this.alive ? Promise.reject(error) : never<T>()),
    );
  }

  runDeferred(): boolean {
    if (this.deferred.length === 0) return false;
    for (let fn = this.deferred.shift(); fn; fn = this.deferred.shift())
      this.run(fn);
    return true;
  }

  die(): void {
    if (!this.alive) return;
    this.alive = false;
    this.deferred.length = 0;
    for (const close of [...this.wires, ...this.links]) close();
  }
}

/** Every method of `target`, and of the objects it holds, called as `life` makes storage calls. */
function watch<T extends object>(target: T, life: NodeLife): T {
  return new Proxy(target, {
    get(inner, key) {
      const value: unknown = Reflect.get(inner, key);
      if (typeof value === "object" && value !== null)
        return watch(value, life);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) =>
        life.during(() => Reflect.apply(value, inner, args));
    },
  });
}

/** The node's storage as one process reaches it; each file keeps one identity. */
function storageOf(storage: Storage, life: NodeLife): Storage {
  const files = new Map<DocFile, DocFile>();
  return {
    directory: watch(storage.directory, life),
    trash: watch(storage.trash, life),
    workspace: watch(storage.workspace, life),
    apiKeys: watch(storage.apiKeys, life),
    outbox: watch(storage.outbox, life),
    shareLinks: watch(storage.shareLinks, life),
    open(home) {
      const file = storage.open(home);
      const known = files.get(file) ?? watch(file, life);
      files.set(file, known);
      return known;
    },
    transaction: (fn) => life.during(() => storage.transaction(fn)),
    close: () => storage.close(),
  };
}

/** A person's upstream store as one process reaches it: a dead one's calls never finish. */
function storeOf(store: LocalStore, life: NodeLife): LocalStore {
  return new Proxy(store, {
    get(inner, key) {
      const value: unknown = Reflect.get(inner, key);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) =>
        life.alive
          ? life.hold(Promise.resolve(Reflect.apply(value, inner, args)))
          : never();
    },
  });
}

/**
 * The node's network: each call to the cloud's HTTP reaches the cloud at one step and its answer at
 * a later one, and the upstream sockets carry the memory network's frames; a cut loses every call
 * on the way and closes every socket, and nothing reaches the cloud until it is joined.
 */
export class CloudLink {
  cut = false;
  /** The 4422 refusals the cloud sent the node. */
  refusals = 0;
  private readonly calls: { run(): void; lose(): void }[] = [];

  constructor(
    private readonly network: MemoryNetwork,
    private readonly cloud: () => CloudApi,
  ) {}

  api(life: NodeLife): CloudApi {
    const carry = <T>(call: (cloud: CloudApi) => Promise<T>): Promise<T> =>
      life.hold(this.carry(call));
    return {
      signIn: (userId) => carry((cloud) => cloud.signIn(userId)),
      demo: () => carry((cloud) => cloud.demo()),
      describe: (token, body) => carry((cloud) => cloud.describe(token, body)),
      adopt: (token, body) => carry((cloud) => cloud.adopt(token, body)),
      forward: (token, request) =>
        carry((cloud) => cloud.forward(token, request)),
    };
  }

  /** `userId`'s upstream socket from `life`; nothing is asked of the cloud without a session. */
  transport(
    life: NodeLife,
    userId: string,
    token: () => string | null,
  ): Transport {
    const inner = this.network.transport(userId);
    const check = (): void => {
      if (!life.alive || this.cut) throw new ConnectError("unreachable");
      if (token() === null) throw new ConnectError("sign_in");
    };
    return {
      connect: async (handlers) => {
        check();
        const decoder = createFrameDecoder({ from: "server" });
        const link = { open: true };
        const connection = await life.hold(
          inner.connect({
            onFrame: (frame) => {
              if (!link.open) return;
              const read = decoder.push(frame);
              const message = read.kind === "message" ? read.message : null;
              if (message?.type === "ERROR")
                this.refusals +=
                  message.code === CODE.VALIDATION_FAILED ? 1 : 0;
              life.run(() => handlers.onFrame(frame));
            },
            onClose: (code, reason) => {
              if (!link.open) return;
              link.open = false;
              life.run(() => handlers.onClose(code, reason));
            },
          }),
        );
        const lose = (): void => {
          if (!link.open) return;
          link.open = false;
          connection.close(1006, "");
          life.run(() => handlers.onClose(1006, ""));
        };
        life.links.add(lose);
        return {
          send: (frame) => {
            if (link.open) connection.send(frame);
          },
          close: (code, reason) => {
            link.open = false;
            life.links.delete(lose);
            connection.close(code, reason);
          },
        };
      },
      createDocument: async (request) => {
        check();
        return life.hold(inner.createDocument(request));
      },
      replay: async (request) => {
        check();
        const answer = await life.hold(inner.replay(request));
        check();
        return answer;
      },
    };
  }

  setCut(cut: boolean, life: NodeLife): void {
    this.cut = cut;
    if (!cut) return;
    for (const call of this.calls.splice(0)) call.lose();
    for (const lose of life.links) lose();
  }

  /** Carries the oldest call, or its answer; false when none waits. */
  step(): boolean {
    const call = this.calls.shift();
    call?.run();
    return call !== undefined;
  }

  queued(): number {
    return this.calls.length;
  }

  private carry<T>(call: (cloud: CloudApi) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const lose = (): void => reject(new ConnectError("unreachable"));
      if (this.cut) return lose();
      const answered = (value: T): void => {
        if (this.cut) return lose();
        this.calls.push({ run: () => resolve(value), lose });
      };
      const run = (): void => void call(this.cloud()).then(answered, reject);
      this.calls.push({ run, lose });
    });
  }
}

/** A new node process over the same storage, records and upstream stores, on `link`. */
export function createNodeProcess(options: {
  clock: FakeClock;
  storage: Storage;
  records: NodeRecords;
  stores: () => MemoryStoreSpace;
  link: CloudLink;
  random: () => Random;
  wipe(): Promise<void>;
}): { life: NodeLife; core: NodeCore } {
  const { link, random } = options;
  const life = new NodeLife(options.clock);
  const store = (userId: string): LocalStore =>
    storeOf(options.stores().store(userId), life);
  const core = createNodeCore({
    storage: storageOf(options.storage, life),
    records: options.records,
    cloud: link.api(life),
    upstream: {
      create: (userId, token) =>
        createSimClient({
          userId,
          deviceId: `node-${userId}`,
          transport: link.transport(life, userId, token),
          store: store(userId),
          clock: life.clock,
          random: random(),
        }),
      store,
    },
    clock: life.clock,
    defer: life.defer,
    random: random(),
    signIn: createDemoSignIn(),
    directory: createDemoDirectory(),
    versions: VERSIONS,
    build: "sim",
    webDir: null,
    launchToken: LAUNCH,
    registry: PRODUCT_SETTING_RULES,
    renderPdf: async () => new Uint8Array(),
    boot: null,
    storeUsage: () => ({ scripts: 0, bytes: 0 }),
    nodeUrl: NODE_URL,
    wipe: options.wipe,
  });
  return { life, core };
}
