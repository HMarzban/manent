// The browser's clock, chance and animation frames, and every port of a tab put together.
import type {
  Clock,
  Frames,
  LeaderPort,
  Random,
  SyncClientPorts,
} from "@manent/sync-client";
import { openIdbStore } from "./idb-store.ts";
import { webLeader } from "./leader.ts";
import { leaseLeader } from "./lease.ts";
import { webTransport } from "./transport.ts";

// Each global is read when it is used, never when the module loads.

export const browserClock: Clock = {
  now: () => Date.now(),
  schedule(fn, delayMs) {
    const timer = setTimeout(fn, delayMs);
    return () => clearTimeout(timer);
  },
};

export const browserRandom: Random = {
  next: () => Math.random(),
  // an array of one: its first element is there
  clientId: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
  bytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
};

export const browserFrames: Frames = {
  request(fn) {
    const frame = requestAnimationFrame(() => fn());
    return () => cancelAnimationFrame(frame);
  },
};

/**
 * The six ports of one tab for one person. The leader is elected by Web Locks where
 * the page has them, and otherwise by a lease that also fences the store's writes.
 */
export async function browserPorts(options: {
  baseUrl: string;
  session: () => string | null;
  userId: string;
}): Promise<SyncClientPorts> {
  const { baseUrl, session, userId } = options;
  const indexedDb = globalThis.indexedDB;
  // not crypto.randomUUID(): like Web Locks it exists only in a secure context
  const tabId = Array.from(browserRandom.bytes(16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  // undefined where the page is not a secure context
  const leasing = navigator.locks === undefined;
  const store = await openIdbStore(
    leasing ? { userId, indexedDb, leaseTabId: tabId } : { userId, indexedDb },
  );
  const leader: LeaderPort = leasing
    ? leaseLeader({ userId, tabId, indexedDb, clock: browserClock })
    : webLeader({ userId, tabId });
  return {
    transport: webTransport({ baseUrl, session }),
    store,
    leader,
    clock: browserClock,
    random: browserRandom,
    frames: browserFrames,
  };
}
