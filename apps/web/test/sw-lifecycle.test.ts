import { expect, test } from "bun:test";
import type { UpdateState } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import {
  createOfflineWarm,
  isConstrainedConnection,
} from "../src/boot/offline-warm.ts";
import {
  UPDATE_CHECK_DEBOUNCE_MS,
  UPDATE_POLL_INTERVAL_MS,
  startSwLifecycle,
} from "../src/boot/sw-lifecycle.ts";
import type { BroadcastChannelLike } from "../src/boot/sw-lifecycle.ts";
import { createClock } from "./services.fixtures.ts";

class FakeTarget {
  readonly #listeners = new Map<string, Set<(event: unknown) => void>>();
  addEventListener(type: string, listener: (event: unknown) => void): void {
    const set = this.#listeners.get(type) ?? new Set();
    set.add(listener);
    this.#listeners.set(type, set);
  }
  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }
  dispatch(type: string, event: unknown = {}): void {
    const handlers = this.#listeners.get(type);
    if (handlers === undefined) return;
    for (const fn of Array.from(handlers)) fn(event);
  }
}

class FakeWorker extends FakeTarget {
  state: ServiceWorkerState;
  readonly posted: unknown[] = [];
  constructor(state: ServiceWorkerState = "installed") {
    super();
    this.state = state;
  }
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
}

class FakeRegistration extends FakeTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  active: FakeWorker | null = null;
  updates = 0;
  failNextUpdate = false;
  async update(): Promise<void> {
    this.updates += 1;
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      throw new TypeError("network down");
    }
  }
}

class FakeContainer extends FakeTarget {
  controller: FakeWorker | null;
  readonly registrations: { url: string; options?: RegistrationOptions }[] = [];
  readonly registration: FakeRegistration;
  readonly ready: Promise<ServiceWorkerRegistration>;
  constructor(controller: FakeWorker | null) {
    super();
    this.controller = controller;
    this.registration = new FakeRegistration();
    this.ready = Promise.resolve(
      this.registration as unknown as ServiceWorkerRegistration,
    );
  }
  async register(
    url: string,
    options?: RegistrationOptions,
  ): Promise<ServiceWorkerRegistration> {
    this.registrations.push({ url, options });
    return this.registration as unknown as ServiceWorkerRegistration;
  }
}

function createChannelBus(): (name: string) => BroadcastChannelLike {
  const peers = new Set<{
    closed: boolean;
    listeners: Set<(event: MessageEvent<unknown>) => void>;
  }>();
  return () => {
    const self = {
      closed: false,
      listeners: new Set<(event: MessageEvent<unknown>) => void>(),
    };
    peers.add(self);
    return {
      postMessage(message: unknown) {
        for (const peer of peers) {
          if (peer === self || peer.closed) continue;
          for (const listener of peer.listeners)
            listener({ data: message } as MessageEvent<unknown>);
        }
      },
      addEventListener(_type, listener) {
        self.listeners.add(listener);
      },
      removeEventListener(_type, listener) {
        self.listeners.delete(listener);
      },
      close() {
        self.closed = true;
        peers.delete(self);
      },
    };
  };
}

test("first install (controller === null) never reloads on controllerchange", async () => {
  const container = new FakeContainer(null);
  const updateState = createValue<UpdateState | null>(null);
  const clock = createClock(100_000);
  let reloads = 0;
  const handle = startSwLifecycle({
    container: container as unknown as ServiceWorkerContainer,
    updateState,
    now: clock.now,
    schedule: clock.schedule,
    online: () => true,
    lastKeyAt: () => null,
    reload: () => {
      reloads += 1;
    },
    win: new FakeTarget() as unknown as Window,
    doc: Object.assign(new FakeTarget(), {
      visibilityState: "visible" as DocumentVisibilityState,
    }) as unknown as Document,
    createChannel: createChannelBus(),
  });
  await handle.ready;
  expect(container.registrations).toEqual([
    { url: "/sw.js", options: { updateViaCache: "none" } },
  ]);
  container.controller = new FakeWorker("activated");
  container.dispatch("controllerchange");
  expect(reloads).toBe(0);
  // A subsequent update in that same session reloads cleanly once explicitly requested.
  const waiting = new FakeWorker("installed");
  container.registration.waiting = waiting;
  await handle.controller.apply();
  expect(waiting.posted).toEqual([{ type: "SKIP_WAITING" }]);
  container.dispatch("controllerchange");
  expect(reloads).toBe(1);
  handle.dispose();
});

test("apply() sends SKIP_WAITING, broadcasts UPDATE_APPLYING, and reloads only controlled tabs safely", async () => {
  const bus = createChannelBus();
  const clock = createClock(100_000);

  // Tab A initiates apply()
  const containerA = new FakeContainer(new FakeWorker("activated"));
  const waitingA = new FakeWorker("installed");
  containerA.registration.waiting = waitingA;
  const stateA = createValue<UpdateState | null>(null);
  let reloadsA = 0;
  const tabA = startSwLifecycle({
    container: containerA as unknown as ServiceWorkerContainer,
    updateState: stateA,
    now: clock.now,
    schedule: clock.schedule,
    online: () => true,
    lastKeyAt: () => null,
    reload: () => {
      reloadsA += 1;
    },
    win: new FakeTarget() as unknown as Window,
    doc: Object.assign(new FakeTarget(), {
      visibilityState: "visible" as DocumentVisibilityState,
    }) as unknown as Document,
    createChannel: bus,
  });

  // Tab B is idle and should follow UPDATE_APPLYING
  const containerB = new FakeContainer(new FakeWorker("activated"));
  const stateB = createValue<UpdateState | null>(null);
  let reloadsB = 0;
  const tabB = startSwLifecycle({
    container: containerB as unknown as ServiceWorkerContainer,
    updateState: stateB,
    now: clock.now,
    schedule: clock.schedule,
    online: () => true,
    lastKeyAt: () => clock.now() - 5_000,
    reload: () => {
      reloadsB += 1;
    },
    win: new FakeTarget() as unknown as Window,
    doc: Object.assign(new FakeTarget(), {
      visibilityState: "visible" as DocumentVisibilityState,
    }) as unknown as Document,
    createChannel: bus,
  });

  // Tab C is actively typing and must NOT reload on UPDATE_APPLYING
  const containerC = new FakeContainer(new FakeWorker("activated"));
  const stateC = createValue<UpdateState | null>(null);
  let reloadsC = 0;
  const tabC = startSwLifecycle({
    container: containerC as unknown as ServiceWorkerContainer,
    updateState: stateC,
    now: clock.now,
    schedule: clock.schedule,
    online: () => true,
    lastKeyAt: () => clock.now() - 500,
    reload: () => {
      reloadsC += 1;
    },
    win: new FakeTarget() as unknown as Window,
    doc: Object.assign(new FakeTarget(), {
      visibilityState: "visible" as DocumentVisibilityState,
    }) as unknown as Document,
    createChannel: bus,
  });

  await Promise.all([tabA.ready, tabB.ready, tabC.ready]);
  expect(stateA.get()).toBe("ready");

  // Unsolicited controllerchange does not reload before apply()
  containerA.dispatch("controllerchange");
  expect(reloadsA).toBe(0);

  await tabA.controller.apply();
  expect(waitingA.posted).toEqual([{ type: "SKIP_WAITING" }]);

  containerA.dispatch("controllerchange");
  containerA.dispatch("controllerchange");
  containerB.dispatch("controllerchange");
  containerC.dispatch("controllerchange");
  expect([reloadsA, reloadsB, reloadsC]).toEqual([1, 1, 0]);

  tabA.dispose();
  tabB.dispose();
  tabC.dispose();
});

test("debounced update checks respond to visibility, pageshow, online, 30m poll, and build-id mismatch", async () => {
  const container = new FakeContainer(new FakeWorker("activated"));
  const updateState = createValue<UpdateState | null>(null);
  const clock = createClock(100_000);
  const win = new FakeTarget();
  const doc = Object.assign(new FakeTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
  });
  let isOnline = true;
  const handle = startSwLifecycle({
    container: container as unknown as ServiceWorkerContainer,
    updateState,
    now: clock.now,
    schedule: clock.schedule,
    online: () => isOnline,
    lastKeyAt: () => null,
    currentBuildId: "build-1",
    win: win as unknown as Window,
    doc: doc as unknown as Document,
    createChannel: createChannelBus(),
  });
  await handle.ready;

  // Matching build id is ignored
  handle.notifyBuildId("build-1");
  await Promise.resolve();
  expect(container.registration.updates).toBe(0);

  // Mismatching build id triggers update
  handle.notifyBuildId("build-2");
  await Promise.resolve();
  expect(container.registration.updates).toBe(1);

  // Debounced within 60s
  doc.dispatch("visibilitychange");
  win.dispatch("pageshow", { persisted: true });
  win.dispatch("online");
  await Promise.resolve();
  expect(container.registration.updates).toBe(1);

  // Offline skips update even after debounce window
  isOnline = false;
  clock.advance(UPDATE_CHECK_DEBOUNCE_MS);
  doc.dispatch("visibilitychange");
  await Promise.resolve();
  expect(container.registration.updates).toBe(1);

  // Online triggers after debounce window
  isOnline = true;
  win.dispatch("online");
  await Promise.resolve();
  expect(container.registration.updates).toBe(2);

  // 30-min interval triggers another check
  clock.advance(UPDATE_POLL_INTERVAL_MS);
  await Promise.resolve();
  expect(container.registration.updates).toBe(3);

  // Explicit check() reports up_to_date or check_failed
  await handle.controller.check();
  expect(updateState.get()).toBe("up_to_date");

  container.registration.failNextUpdate = true;
  await handle.controller.check();
  expect(updateState.get()).toBe("check_failed");

  handle.dispose();
});

test("createOfflineWarm waits for idle + visible, pauses on saveData/2g, and warmNow overrides", async () => {
  expect([
    isConstrainedConnection({ saveData: true }),
    isConstrainedConnection({ effectiveType: "2g" }),
    isConstrainedConnection({ effectiveType: "slow-2g" }),
    isConstrainedConnection({ effectiveType: "4g", saveData: false }),
    isConstrainedConnection(null),
  ]).toEqual([true, true, true, false, false]);

  const container = new FakeContainer(new FakeWorker("activated"));
  const active = new FakeWorker("activated");
  container.registration.active = active;
  const clock = createClock(10_000);
  let lastKey: number | null = 9_500;
  const frames: (() => void)[] = [];
  const win = new FakeTarget();
  const doc = Object.assign(new FakeTarget(), {
    readyState: "complete" as DocumentReadyState,
    visibilityState: "visible" as DocumentVisibilityState,
  });

  const warm = createOfflineWarm({
    container: container as unknown as ServiceWorkerContainer,
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => {
      frames.push(fn);
      return () => {};
    },
    lastKeyAt: () => lastKey,
    connection: () => ({ saveData: false, effectiveType: "4g" }),
    win: win as unknown as Window,
    doc: doc as unknown as Document,
  });

  // Run first frame; still typing within 2s so not warmed yet
  frames.shift()?.();
  await Promise.resolve();
  await Promise.resolve();
  expect(active.posted).toEqual([]);

  // Advance past 2s typing idle
  clock.advance(2_000);
  await Promise.resolve();
  expect(active.posted).toEqual([{ type: "WARM_OFFLINE_TOOLS" }]);

  // Mirror SW readiness message
  container.dispatch("message", {
    data: {
      type: "OFFLINE_READINESS_STATE",
      status: "ready",
      cached: 3,
      total: 3,
    },
  });
  expect(warm.readiness.get()).toEqual({
    status: "ready",
    cached: 3,
    total: 3,
  });
  warm.dispose();

  // Constrained connection pauses auto-warm until warmNow() is called
  const active2 = new FakeWorker("activated");
  const container2 = new FakeContainer(active2);
  container2.registration.active = active2;
  const frames2: (() => void)[] = [];
  const paused = createOfflineWarm({
    container: container2 as unknown as ServiceWorkerContainer,
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => {
      frames2.push(fn);
      return () => {};
    },
    lastKeyAt: () => null,
    connection: () => ({ saveData: true, effectiveType: "4g" }),
    win: win as unknown as Window,
    doc: doc as unknown as Document,
  });
  frames2.shift()?.();
  await Promise.resolve();
  await Promise.resolve();
  expect(paused.readiness.get().status).toBe("paused_save_data");
  expect(active2.posted).toEqual([{ type: "OFFLINE_READINESS" }]);

  paused.readiness.warmNow();
  await Promise.resolve();
  expect(active2.posted).toEqual([
    { type: "OFFLINE_READINESS" },
    { type: "WARM_OFFLINE_TOOLS" },
  ]);
  paused.dispose();
});

test("offlineWarm tracks install phases, stays quiet on returning ready visits, reports online_only without SW, and resumes on online", async () => {
  const clock = createClock(50_000);
  const noSw = createOfflineWarm({
    container: null,
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => {
      fn();
      return () => {};
    },
    lastKeyAt: () => null,
  });
  expect(noSw.readiness.get()).toEqual({
    status: "online_only",
    cached: 0,
    total: 0,
  });
  expect(noSw.readiness.wasActiveInSession?.()).toBe(false);
  noSw.dispose();

  // Returning visit: controller already active and SW replies ready directly -> wasActiveInSession stays false
  const returningContainer = new FakeContainer(new FakeWorker("activated"));
  const returningWarm = createOfflineWarm({
    container: returningContainer as unknown as ServiceWorkerContainer,
    now: clock.now,
    schedule: clock.schedule,
    frame: () => () => {},
    lastKeyAt: () => null,
    win: new FakeTarget() as unknown as Window,
    doc: Object.assign(new FakeTarget(), {
      readyState: "complete" as DocumentReadyState,
      visibilityState: "visible" as DocumentVisibilityState,
    }) as unknown as Document,
  });
  returningContainer.dispatch("message", {
    data: {
      type: "OFFLINE_READINESS_STATE",
      status: "ready",
      cached: 5,
      total: 5,
    },
  });
  expect(returningWarm.readiness.get().status).toBe("ready");
  expect(returningWarm.readiness.wasActiveInSession?.()).toBe(false);
  returningWarm.dispose();

  // First install + mid-warm drop + online resume
  const firstContainer = new FakeContainer(null);
  const activeWorker = new FakeWorker("activated");
  firstContainer.registration.active = activeWorker;
  const win = new FakeTarget();
  const doc = Object.assign(new FakeTarget(), {
    readyState: "complete" as DocumentReadyState,
    visibilityState: "visible" as DocumentVisibilityState,
  });
  const firstWarm = createOfflineWarm({
    container: firstContainer as unknown as ServiceWorkerContainer,
    now: clock.now,
    schedule: clock.schedule,
    frame: () => () => {},
    lastKeyAt: () => null,
    win: win as unknown as Window,
    doc: doc as unknown as Document,
  });
  const updateState = createValue<UpdateState | null>(null);
  const installingWorker = new FakeWorker("installing");
  firstContainer.registration.installing = installingWorker;
  const lifecycle = startSwLifecycle({
    container: firstContainer as unknown as ServiceWorkerContainer,
    updateState,
    now: clock.now,
    schedule: clock.schedule,
    online: () => true,
    lastKeyAt: () => null,
    onInstallPhase: firstWarm.notifyInstallPhase,
    win: win as unknown as Window,
    doc: doc as unknown as Document,
    createChannel: createChannelBus(),
  });
  await lifecycle.ready;
  expect(firstWarm.readiness.get().status).toBe("installing");
  expect(firstWarm.readiness.wasActiveInSession?.()).toBe(true);

  // Mid-warm drop to shell_only resumes when browser fires online
  firstContainer.dispatch("message", {
    data: {
      type: "OFFLINE_READINESS_STATE",
      status: "warming",
      cached: 2,
      total: 5,
    },
  });
  firstContainer.dispatch("message", {
    data: {
      type: "OFFLINE_READINESS_STATE",
      status: "shell_only",
      cached: 2,
      total: 5,
    },
  });
  activeWorker.posted.length = 0;
  win.dispatch("online");
  await Promise.resolve();
  expect(activeWorker.posted).toEqual([{ type: "WARM_OFFLINE_TOOLS" }]);

  lifecycle.dispose();
  firstWarm.dispose();
});
