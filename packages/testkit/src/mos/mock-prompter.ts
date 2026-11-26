// Deterministic in-process mock MOS 2.8.5 / Autoscript WinPlus-IP TCP prompter server for tests and Tour E2E.
import {
  MOS_MAX_MESSAGE_BYTES,
  createMosFramer,
  encodeMosMessage,
  parseMosMessage,
} from "@manent/formats";
import type { MosDialect, MosMessage } from "@manent/formats";
import { createServer } from "node:net";
import type { AddressInfo, Server, Socket } from "node:net";

export interface MockMosStory {
  readonly storyId: string;
  readonly storySlug: string;
  readonly storyNum: string | null;
  readonly paragraphs: readonly string[];
  readonly presenter: string | null;
  readonly durationMs: number | null;
}

export interface MockMosRunningOrder {
  readonly roId: string;
  readonly roSlug: string;
  readonly dialect: MosDialect;
  readonly stories: MockMosStory[];
}

export interface MockMosPrompter {
  readonly host: string;
  readonly port: number;
  readonly received: readonly MosMessage[];
  readonly runningOrders: ReadonlyMap<string, MockMosRunningOrder>;
  /** Resolves once `predicate(received)` holds, or rejects after `timeoutMs`. */
  waitFor(
    predicate: (messages: readonly MosMessage[]) => boolean,
    timeoutMs?: number,
  ): Promise<void>;
  /** Sends a MOS message (e.g. `roReq`) to all currently connected NCS clients. */
  sendToClients(message: MosMessage): void;
  /** Force-drops all active TCP connections to simulate studio network loss. */
  disconnectAll(): void;
  close(): Promise<void>;
}

interface Waiter {
  predicate(messages: readonly MosMessage[]): boolean;
  resolve(): void;
  timer: ReturnType<typeof setTimeout>;
}

function applyToRunningOrders(
  runningOrders: Map<string, MockMosRunningOrder>,
  msg: MosMessage,
  defaultDialect: MosDialect,
): void {
  if (msg.kind === "roCreate") {
    runningOrders.set(msg.roId, {
      roId: msg.roId,
      roSlug: msg.roSlug,
      dialect: msg.dialect ?? defaultDialect,
      stories: msg.stories.map((s) => ({
        storyId: s.storyId,
        storySlug: s.storySlug,
        storyNum: s.storyNum ?? null,
        paragraphs: [],
        presenter: null,
        durationMs: null,
      })),
    });
    return;
  }
  if (msg.kind === "roDelete") {
    runningOrders.delete(msg.roId);
    return;
  }
  const ro = "roId" in msg ? runningOrders.get(msg.roId) : undefined;
  if (ro === undefined) return;
  if (msg.kind === "roStorySend") {
    const idx = ro.stories.findIndex((s) => s.storyId === msg.storyId);
    const updated: MockMosStory = {
      storyId: msg.storyId,
      storySlug: msg.storySlug,
      storyNum: msg.storyNum ?? null,
      paragraphs: [...msg.paragraphs],
      presenter: msg.presenter ?? null,
      durationMs: msg.durationMs ?? null,
    };
    if (idx === -1) ro.stories.push(updated);
    else ro.stories[idx] = updated;
    return;
  }
  if (msg.kind === "roElementAction") {
    if (msg.operation === "DELETE") {
      const drop = new Set(msg.sourceStoryIds ?? []);
      const kept = ro.stories.filter((s) => !drop.has(s.storyId));
      ro.stories.splice(0, ro.stories.length, ...kept);
    } else if (msg.operation === "INSERT") {
      const added: MockMosStory[] = (msg.stories ?? []).map((s) => ({
        storyId: s.storyId,
        storySlug: s.storySlug,
        storyNum: s.storyNum ?? null,
        paragraphs: [],
        presenter: null,
        durationMs: null,
      }));
      const idx =
        msg.targetStoryId === undefined
          ? ro.stories.length
          : ro.stories.findIndex((s) => s.storyId === msg.targetStoryId);
      ro.stories.splice(idx === -1 ? ro.stories.length : idx, 0, ...added);
    } else if (msg.operation === "MOVE") {
      const ids = msg.sourceStoryIds ?? [];
      const set = new Set(ids);
      const moving = ids
        .map((id) => ro.stories.find((s) => s.storyId === id))
        .filter((s): s is MockMosStory => s !== undefined);
      const kept = ro.stories.filter((s) => !set.has(s.storyId));
      const idx =
        msg.targetStoryId === undefined
          ? kept.length
          : kept.findIndex((s) => s.storyId === msg.targetStoryId);
      kept.splice(idx === -1 ? kept.length : idx, 0, ...moving);
      ro.stories.splice(0, ro.stories.length, ...kept);
    } else if (msg.operation === "REPLACE" && msg.stories?.[0] !== undefined) {
      const idx = ro.stories.findIndex((s) => s.storyId === msg.targetStoryId);
      const next = msg.stories[0];
      if (idx !== -1) {
        ro.stories[idx] = {
          storyId: next.storyId,
          storySlug: next.storySlug,
          storyNum: next.storyNum ?? null,
          paragraphs: [],
          presenter: null,
          durationMs: null,
        };
      }
    }
  }
}

function buildAckFor(msg: MosMessage): MosMessage | null {
  const env = {
    mosId: msg.mosId,
    ncsId: msg.ncsId,
    ...(msg.messageId !== undefined ? { messageId: msg.messageId } : {}),
  };
  if (msg.kind === "heartbeat")
    return { ...env, kind: "heartbeat", time: msg.time };
  if (
    msg.kind === "roCreate" ||
    msg.kind === "roStorySend" ||
    msg.kind === "roElementAction" ||
    msg.kind === "roDelete"
  ) {
    return { ...env, kind: "roAck", roId: msg.roId, roStatus: "OK" };
  }
  return null;
}

/** Starts a loopback mock MOS 2.8.5 / Autoscript WinPlus-IP TCP prompter (ephemeral port `0` default). */
export async function createMockMosPrompter(options?: {
  host?: string;
  port?: number;
  dialect?: MosDialect;
}): Promise<MockMosPrompter> {
  const host = options?.host ?? "127.0.0.1";
  const port = options?.port ?? 0;
  const dialect = options?.dialect ?? "autoscript_winplus_ip";

  const received: MosMessage[] = [];
  const runningOrders = new Map<string, MockMosRunningOrder>();
  const sockets = new Set<Socket>();
  const waiters = new Set<Waiter>();

  function notifyWaiters(): void {
    for (const waiter of Array.from(waiters)) {
      if (waiter.predicate(received)) {
        clearTimeout(waiter.timer);
        waiters.delete(waiter);
        waiter.resolve();
      }
    }
  }

  const server: Server = createServer((socket) => {
    sockets.add(socket);
    const framer = createMosFramer({ maxBytes: MOS_MAX_MESSAGE_BYTES });
    socket.on("data", (chunk: Uint8Array) => {
      try {
        for (const xml of framer.push(chunk)) {
          const msg = parseMosMessage(xml);
          received.push(msg);
          applyToRunningOrders(runningOrders, msg, dialect);
          const ack = buildAckFor(msg);
          if (ack !== null) socket.write(encodeMosMessage(ack));
          notifyWaiters();
        }
      } catch {
        socket.destroy();
      }
    });
    socket.on("error", () => socket.destroy());
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const addr = server.address() as AddressInfo;
  return {
    host,
    port: addr.port,
    received,
    runningOrders,
    waitFor(predicate, timeoutMs = 5_000) {
      if (predicate(received)) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const waiter: Waiter = {
          predicate,
          resolve,
          timer: setTimeout(() => {
            waiters.delete(waiter);
            reject(
              new Error("timed out waiting for mock MOS prompter message"),
            );
          }, timeoutMs),
        };
        waiters.add(waiter);
      });
    },
    sendToClients(message) {
      const bytes = encodeMosMessage(message);
      for (const s of sockets) s.write(bytes);
    },
    disconnectAll() {
      for (const s of sockets) s.destroy();
      sockets.clear();
    },
    close() {
      for (const w of waiters) clearTimeout(w.timer);
      waiters.clear();
      for (const s of sockets) s.destroy();
      sockets.clear();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
