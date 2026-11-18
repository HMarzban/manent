import { expect, test } from "bun:test";
import type { Clock } from "@manent/sync-client";
import { createFakeClock } from "@manent/sync-client/testing";
import { IDBFactory } from "fake-indexeddb";
import { LEASE_MS, LEASE_RENEW_MS, leaseLeader } from "../src/index.ts";
import type { ChannelLike } from "../src/index.ts";

interface Lease {
  name: string;
  tabId: string;
  expiresAt: number;
}

/** Lets fake-indexeddb, which works in macrotasks, finish what it was asked. */
async function settled(): Promise<void> {
  for (let turn = 0; turn < 30; turn += 1)
    await new Promise<void>((resolve) => setImmediate(resolve));
}

async function readLease(indexedDb: IDBFactory): Promise<Lease | null> {
  const opening = indexedDb.open("manent:dana");
  const db = await new Promise<IDBDatabase>((resolve) =>
    opening.addEventListener("success", () => resolve(opening.result)),
  );
  const request = db.transaction(["lease"]).objectStore("lease").get("leader");
  const lease = await new Promise<Lease | null>((resolve) =>
    request.addEventListener("success", () => resolve(request.result ?? null)),
  );
  db.close();
  return lease;
}

/** A channel that carries nothing: these tests watch the lease, not the messages. */
function silentChannel(): ChannelLike {
  return { onmessage: null, postMessage: () => {}, close: () => {} };
}

/**
 * One machine's clock shared by its tabs: timers run on a monotonic fake clock, as
 * setTimeout does, while `now()` is the wall clock, which can be set back. A tab's
 * timers can be frozen, as a hidden tab's are; frozen timers that fall due run when
 * the tab resumes.
 */
function machine() {
  const fake = createFakeClock();
  let offset = 0;
  const frozen = new Set<string>();
  const held = new Map<string, (() => void)[]>();
  const clockOf = (tabId: string): Clock => ({
    now: () => fake.clock.now() + offset,
    schedule: (fn, delayMs) =>
      fake.clock.schedule(() => {
        if (!frozen.has(tabId)) fn();
        else held.set(tabId, [...(held.get(tabId) ?? []), fn]);
      }, delayMs),
  });
  return {
    clockOf,
    stopTimersOf: (tabId: string) => frozen.add(tabId),
    resumeTimersOf: (tabId: string) => {
      frozen.delete(tabId);
      for (const fn of held.get(tabId) ?? []) fake.clock.schedule(fn, 0);
      held.delete(tabId);
    },
    setWallClock: (toNow: number) => {
      offset = toNow - fake.clock.now();
    },
    /** Moves time on a second at a time, letting the database answer between. */
    advance: async (ms: number) => {
      for (let step = 0; step < ms; step += 1_000) {
        fake.advance(1_000);
        await settled();
      }
    },
  };
}

function tabs(indexedDb: IDBFactory, world: ReturnType<typeof machine>) {
  const events: string[] = [];
  const campaign = (tabId: string) =>
    leaseLeader({
      userId: "dana",
      tabId,
      indexedDb,
      clock: world.clockOf(tabId),
      channel: silentChannel,
    }).campaign({
      onElected: () => events.push(tabId),
      onDeposed: () => events.push(`-${tabId}`),
    });
  return { events, campaign };
}

test("the lease lasts 15 seconds and is renewed every 5", () => {
  expect([LEASE_MS, LEASE_RENEW_MS]).toEqual([15_000, 5_000]);
});

test("without Web Locks one tab holds the lease, renews it, and another takes it only when it lapses", async () => {
  const indexedDb = new IDBFactory();
  const world = machine();
  const { events, campaign } = tabs(indexedDb, world);
  campaign("a");
  await settled();
  campaign("b");
  await settled();
  expect(events).toEqual(["a"]);
  expect(await readLease(indexedDb)).toEqual({
    name: "leader",
    tabId: "a",
    expiresAt: 15_000,
  });
  // renewed; b tried and was refused
  await world.advance(5_000);
  expect((await readLease(indexedDb))!.expiresAt).toBe(20_000);
  expect(events).toEqual(["a"]);
  // a's timers froze (a hidden tab): the lease lapses
  world.stopTimersOf("a");
  await world.advance(20_000);
  expect(events).toEqual(["a", "b"]);
  // a's next renewal finds b and is deposed
  world.resumeTimersOf("a");
  await world.advance(5_000);
  expect(events).toEqual(["a", "b", "-a"]);
  expect((await readLease(indexedDb))!.tabId).toBe("b");
});

test("giving the lead up frees it at once", async () => {
  const indexedDb = new IDBFactory();
  const world = machine();
  const { events, campaign } = tabs(indexedDb, world);
  const giveUp = campaign("a");
  await settled();
  campaign("b");
  await settled();
  giveUp();
  await settled();
  expect(await readLease(indexedDb)).toBeNull();
  await world.advance(5_000);
  expect(events).toEqual(["a", "b"]);
});

test("a clock that went backwards cannot keep a dead leader", async () => {
  const indexedDb = new IDBFactory();
  const world = machine();
  const { events, campaign } = tabs(indexedDb, world);
  campaign("a");
  await settled();
  campaign("b");
  await settled();
  expect((await readLease(indexedDb))!.expiresAt).toBe(15_000);
  world.stopTimersOf("a");
  world.setWallClock(-3_600_000);
  await world.advance(5_000);
  expect(events).toEqual(["a", "b"]);
});

/** An open request that fails, as a page's whose storage is refused. */
function refusedOpen() {
  return {
    error: new DOMException("no storage here", "InvalidStateError"),
    addEventListener(type: string, listener: () => void) {
      if (type === "error") queueMicrotask(listener);
    },
  };
}

test("a tab whose database fails keeps trying, and stops once it gives up", async () => {
  const fake = createFakeClock();
  const leader = leaseLeader({
    userId: "dana",
    tabId: "a",
    indexedDb: { open: refusedOpen } as unknown as IDBFactory,
    clock: fake.clock,
    channel: silentChannel,
  });
  leader.campaign({ onElected: () => {}, onDeposed: () => {} });
  await settled();
  expect(fake.pending()).toBe(1);
  // given up while an attempt is still failing
  leader.campaign({ onElected: () => {}, onDeposed: () => {} })();
  await settled();
  expect(fake.pending()).toBe(1);
});
