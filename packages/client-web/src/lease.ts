// The leader where Web Locks are missing (a page that is not a secure context): a lease
// record in the user's own database, claimed, renewed and given up in transactions.
import type { Clock, LeaderPort } from "@manent/sync-client";
import { openLocalDatabase } from "./idb-store.ts";
import { webLeader } from "./leader.ts";
import type { ChannelLike } from "./leader.ts";

/** How long a lease lasts from its last renewal. */
export const LEASE_MS = 15_000;
/** How often the holder renews and a campaigner tries again. */
export const LEASE_RENEW_MS = 5_000;

interface Lease {
  name: "leader";
  tabId: string;
  expiresAt: number;
}

type Attempt = "elected" | "renewed" | "refused" | "deposed";

/**
 * A lease from more than LEASE_MS ahead counts as lapsed: the clock went back, and
 * otherwise a dead holder would keep the lead for as long as the clock had jumped.
 */
function isLapsed(lease: Lease, now: number): boolean {
  return lease.expiresAt <= now || lease.expiresAt > now + LEASE_MS;
}

function judge(
  lease: Lease | null,
  tabId: string,
  leading: boolean,
  now: number,
): Attempt {
  if (leading)
    return lease !== null && lease.tabId !== tabId ? "deposed" : "renewed";
  return lease === null || isLapsed(lease, now) ? "elected" : "refused";
}

/** One readwrite transaction over the lease: `change` is given the record and says what to write, if anything. */
async function withLease<T>(
  indexedDb: IDBFactory,
  userId: string,
  change: (lease: Lease | null, store: IDBObjectStore) => T,
): Promise<T> {
  const db = await openLocalDatabase(indexedDb, userId);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(["lease"], "readwrite");
      const store = tx.objectStore("lease");
      const read: IDBRequest<Lease | undefined> = store.get("leader");
      let result: T;
      read.addEventListener("success", () => {
        result = change(read.result ?? null, store);
      });
      tx.addEventListener("complete", () => resolve(result));
      tx.addEventListener("abort", () => reject(tx.error));
    });
  } finally {
    db.close();
  }
}

/**
 * Where Web Locks are missing. The holder renews every LEASE_RENEW_MS and a campaigner
 * tries as often; a renewal that finds another tab's lease calls `onDeposed`, and the
 * campaign ends. Giving the lead up deletes the record. A late renewal is harmless:
 * the store fences every write by the lease. Messages travel as with `webLeader`.
 */
export function leaseLeader(options: {
  userId: string;
  tabId: string;
  indexedDb: IDBFactory;
  clock: Clock;
  channel?: (name: string) => ChannelLike;
}): LeaderPort {
  const { userId, tabId, indexedDb, clock } = options;
  const tabs = webLeader({ userId, tabId, channel: options.channel });
  const attempt = (leading: boolean): Promise<Attempt> =>
    withLease(indexedDb, userId, (lease, store) => {
      const now = clock.now();
      const outcome = judge(lease, tabId, leading, now);
      if (outcome === "elected" || outcome === "renewed")
        store.put({ name: "leader", tabId, expiresAt: now + LEASE_MS });
      return outcome;
    });
  const release = (): Promise<void> =>
    withLease(indexedDb, userId, (lease, store) => {
      if (lease?.tabId === tabId) store.delete("leader");
    });
  return {
    tabId,
    campaign(handlers) {
      let leading = false;
      let over = false;
      let cancel: (() => void) | null = null;
      // one attempt at a time, in order, so that giving up always runs after the last claim
      let work: Promise<void> = Promise.resolve();
      const next = (): void => {
        if (!over) cancel = clock.schedule(tick, LEASE_RENEW_MS);
      };
      const settle = (outcome: Attempt): void => {
        if (over) return;
        if (outcome === "deposed") {
          over = true;
          handlers.onDeposed();
          return;
        }
        if (outcome === "elected") {
          leading = true;
          handlers.onElected();
        }
        next();
      };
      function tick(): void {
        work = work
          .then(() => attempt(leading))
          // a failed attempt changes nothing: it is made again at the next tick
          .then(settle, next);
      }
      tick();
      return () => {
        over = true;
        cancel?.();
        // if this fails, the lease lapses by itself after LEASE_MS
        work = work.then(release).catch(() => {});
      };
    },
    post: tabs.post,
    listen: tabs.listen,
  };
}
