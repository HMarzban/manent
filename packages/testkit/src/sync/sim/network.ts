// The simulated server: a sync service over memory storage, reached through the memory network's
// server ends as the socket reaches it and through replays that wait to be served and answered,
// and a crash that can take it down at any commit.
import {
  DEFAULT_LIMITS,
  createInlineCheckpointer,
  createSyncService,
  peerOf,
} from "@manent/server-core";
import type {
  Clock,
  Connection,
  ConnectionData,
  Peer,
  ReplayOutcome,
  SyncLimits,
  SyncService,
} from "@manent/server-core";
import { SimulatedCrash } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import { ConnectError } from "@manent/sync-client";
import type {
  FakeClock,
  MemoryNetwork,
  ServerEnd,
} from "@manent/sync-client/testing";
import {
  CODE,
  FRAME_LIMIT_BYTES,
  MESSAGE_LIMIT_BYTES,
  ProtocolError,
  createFrameDecoder,
  createMessageIds,
  gateConnection,
} from "@manent/sync-protocol";
import type {
  FrameDecoder,
  Message,
  PushResult,
  ReplayRequest,
  ServerVersions,
} from "@manent/sync-protocol";
import { DOC } from "./device.ts";

/** One server process: what it serves with, until it dies. */
export interface SimServer {
  /** A new service over the same storage; one still running is dropped first. */
  start(): void;
  /** The next commit throws SimulatedCrash and takes the server down, or it goes down at once. */
  crash(when: "before_commit" | "after_commit" | "now"): void;
  /** The service hears that a backup was put back. */
  restored(): void;
  /** Every open connection is closed 4401, as when sessions expire. */
  expireSessions(): void;
  /** Runs what the service deferred, as the end of its turn would; false when nothing was. */
  runDeferred(): boolean;
  /** The service rebuilds the world's document at its room's next quiet moment. */
  requestRebuild(): void;
  /** Rebuilds every service so far completed. */
  rebuilds(): number;
  /** Serves the oldest waiting replay, or delivers the oldest waiting answer; false when none waits. */
  stepReplay(): boolean;
  /** Replays and answers waiting. */
  replaysQueued(): number;
  /** While cut, waiting replays and answers are lost, and so is an answer made meanwhile. */
  partition(cut: boolean): void;
  readonly limits: SyncLimits;
}

/** A replay request waiting to be served, or its answer waiting to reach the device. */
interface Exchange {
  run(): void;
  /** The device hears the request fail, as when a connection drops. */
  lose(): void;
}

// peerOf never reads a connection's data, and only server-core can make a real one
const SIM_DATA = {} as ConnectionData;
/** The chance that the service's turn ends after a frame, so later frames may share one commit. */
const TURN_ENDS = 0.5;
// few updates between checkpoints, so that runs load from checkpoints and damage them
const LIMITS: SyncLimits = Object.freeze({
  ...DEFAULT_LIMITS,
  checkpointEvery: 25,
});

function read(
  decoder: FrameDecoder,
  frame: Uint8Array,
): PushResult | ProtocolError {
  try {
    return decoder.push(frame);
  } catch (error) {
    if (error instanceof ProtocolError) return error;
    throw error;
  }
}

/** A service and the connections it serves, until a crash ends both. */
class Life {
  readonly service: SyncService;
  readonly closers = new Set<(code: number, reason: string) => void>();
  readonly deferred: (() => void)[] = [];
  /** How each replay being computed is lost when the process dies. */
  readonly replaying = new Set<() => void>();
  alive = true;
  private readonly down: () => void;

  constructor(options: {
    storage: MemoryStorage;
    clock: FakeClock;
    versions: ServerVersions;
    limits: SyncLimits;
    ids: () => string;
    down: () => void;
  }) {
    const { storage, versions, limits, ids } = options;
    this.down = options.down;
    const defer = (fn: () => void): void => {
      this.deferred.push(fn);
    };
    const clock: Clock = {
      now: options.clock.clock.now,
      schedule: (fn, delayMs) =>
        options.clock.clock.schedule(() => this.guard(fn), delayMs),
    };
    this.service = createSyncService({
      storage,
      clock,
      defer,
      ids,
      versions,
      limits,
      checkpointer: createInlineCheckpointer({ storage, defer }),
    });
  }

  /** Server work: a SimulatedCrash takes the process down; work for a dead process does not run. */
  guard(work: () => void): void {
    if (!this.alive) return;
    try {
      work();
    } catch (error) {
      if (!(error instanceof SimulatedCrash)) throw error;
      this.down();
    }
  }
}

/** HELLO, then WELCOME and the peer the service knows the connection by; null when refused. */
function welcome(
  life: Life,
  connection: Connection,
  end: ServerEnd,
  hello: Message,
  context: { versions: ServerVersions; limits: SyncLimits },
): Peer | null {
  if (hello.type !== "HELLO") {
    connection.close(CODE.BAD_FRAME, "bad_frame");
    return null;
  }
  const gate = gateConnection(hello.versions, context.versions);
  if (!gate.ok) {
    connection.close(gate.code, "too_old");
    return null;
  }
  const identity = { userId: end.userId, name: end.userId };
  const session = {
    identity,
    deviceId: hello.deviceId,
    versions: hello.versions,
    address: "127.0.0.1",
  };
  const peer = peerOf(connection, session, createMessageIds(), context.limits);
  const limits = {
    frameBytes: FRAME_LIMIT_BYTES,
    messageBytes: MESSAGE_LIMIT_BYTES,
  };
  peer.send({
    type: "WELCOME",
    session: identity,
    limits,
    server: context.versions,
  });
  const attached = life.service.attach(peer);
  if (attached.ok) return peer;
  connection.close(attached.code, "rate_limited");
  return null;
}

/** One server end, served as the socket serves a connection: HELLO first, then the service. */
function serveEnd(
  life: Life,
  end: ServerEnd,
  context: {
    versions: ServerVersions;
    limits: SyncLimits;
    random: () => number;
    runDeferred: () => boolean;
  },
): void {
  const decoder = createFrameDecoder({ from: "client" });
  let peer: Peer | null = null;
  const leave = (): void => {
    life.closers.delete(close);
    const left = peer;
    if (left !== null) life.deferred.push(() => life.service.detach(left));
  };
  const close = (code: number, reason: string): void => {
    end.close(code, reason);
    leave();
  };
  const connection: Connection = {
    data: SIM_DATA,
    bufferedBytes: 0,
    send(frame) {
      end.send(frame);
      return "sent";
    },
    close,
  };
  life.closers.add(close);
  end.onClose = () => life.guard(leave);
  end.onFrame = (frame) => {
    life.guard(() => {
      const result = read(decoder, frame);
      if (result instanceof ProtocolError)
        return close(result.code, "bad_frame");
      if (result.kind === "pending") return;
      if (result.kind === "skipped") {
        if (peer !== null && result.doc !== null)
          life.service.skipped(peer, result.doc);
        return;
      }
      const { message } = result;
      if (peer === null) {
        peer = welcome(life, connection, end, message, context);
        return;
      }
      if (message.type === "HELLO") return close(CODE.BAD_FRAME, "bad_frame");
      if (message.type === "PING")
        return peer.send({ type: "PONG", nonce: message.nonce });
      life.service.receive(peer, message);
    });
    if (context.random() < TURN_ENDS) context.runDeferred();
  };
}

/** The replays waiting, as HTTP carries them: a request until it is served, then its answer until it is delivered. */
function createReplayLine(server: {
  life(): Life | null;
  runDeferred(): boolean;
  down(): void;
}) {
  const waiting: Exchange[] = [];
  let cut = false;
  const serve = (
    userId: string,
    request: ReplayRequest,
    answered: (outcome: ReplayOutcome) => void,
    lose: () => void,
  ): void => {
    const life = server.life();
    if (life === null) return lose();
    life.replaying.add(lose);
    // the route hands the service the body as parsed JSON
    const body: unknown = JSON.parse(JSON.stringify(request));
    life.service.replay(userId, body).then(
      (outcome) => {
        life.replaying.delete(lose);
        if (cut) return lose();
        waiting.push({ run: () => answered(outcome), lose });
      },
      (error: unknown) => {
        if (!(error instanceof SimulatedCrash)) throw error;
        server.down();
      },
    );
    server.runDeferred();
  };
  return {
    request: (userId: string, request: ReplayRequest) =>
      new Promise<ReplayOutcome>((resolve, reject) => {
        const lose = (): void => reject(new ConnectError("unreachable"));
        const run = (): void => serve(userId, request, resolve, lose);
        waiting.push({ run, lose });
      }),
    step(): boolean {
      const next = waiting.shift();
      next?.run();
      return next !== undefined;
    },
    queued: () => waiting.length,
    partition(cutNow: boolean): void {
      cut = cutNow;
      if (cut) for (const exchange of waiting.splice(0)) exchange.lose();
    },
  };
}

/** Starts down: `start()` brings the first service up. `limits` lays over the simulation's own. */
export function createSimServer(options: {
  network: MemoryNetwork;
  storage: MemoryStorage;
  clock: FakeClock;
  versions: ServerVersions;
  random: () => number;
  limits?: Partial<SyncLimits>;
}): SimServer {
  const { network, storage, clock, versions } = options;
  const limits: SyncLimits = Object.freeze({ ...LIMITS, ...options.limits });
  let life: Life | null = null;
  let versionIds = 0;
  /** Rebuilds of the services that have died. */
  let rebuiltBefore = 0;
  const ids = (): string => `version-${++versionIds}`;
  const down = (): void => {
    if (life === null) return;
    life.alive = false;
    rebuiltBefore += life.service.stats().rebuilds;
    for (const close of life.closers) close(1006, "");
    for (const lose of life.replaying) lose();
    life = null;
  };
  const runDeferred = (): boolean => {
    const current = life;
    if (current === null || current.deferred.length === 0) return false;
    for (
      let fn = current.deferred.shift();
      fn !== undefined;
      fn = current.deferred.shift()
    )
      current.guard(fn);
    return true;
  };
  const replays = createReplayLine({ life: () => life, runDeferred, down });
  const context = { versions, limits, random: options.random, runDeferred };
  network.serve({
    connected(end) {
      if (life === null) return end.close(1006, "");
      serveEnd(life, end, context);
    },
    createDocument(userId, request) {
      if (life === null) throw new ConnectError("unreachable");
      const made = life.service.access.create(userId, request);
      if (made.ok) return { ok: true };
      return {
        ok: false,
        code: made.code === "deleted" ? "deleted" : "forbidden",
      };
    },
    replay: replays.request,
  });
  return {
    start() {
      down();
      storage.crashOnCommit(null);
      life = new Life({ storage, clock, versions, limits, ids, down });
    },
    crash(when) {
      if (when === "now") return down();
      storage.crashOnCommit(when === "before_commit" ? "before" : "after");
    },
    restored: () => life?.service.restored(),
    expireSessions() {
      for (const close of life?.closers ?? [])
        close(CODE.UNAUTHENTICATED, "unauthenticated");
    },
    runDeferred,
    requestRebuild: () => life?.service.requestRebuild(DOC),
    rebuilds: () => rebuiltBefore + (life?.service.stats().rebuilds ?? 0),
    stepReplay: replays.step,
    replaysQueued: replays.queued,
    partition: replays.partition,
    limits,
  };
}
