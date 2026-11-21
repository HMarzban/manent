// Stand-ins for the world a person's services run in: storage, its events, a clock, the server, the router and the window.
import { jsonMap } from "@manent/crdt";
import { soloLeader } from "@manent/sync-client";
import type { LocalStore, Random } from "@manent/sync-client";
import {
  createMemoryNetwork,
  createMemoryStore,
} from "@manent/sync-client/testing";
import { indexDocId, workspaceHome } from "@manent/sync-protocol";
import type { UpdateState, VersionSet } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import type { Api } from "../src/api.ts";
import { placeholderMount } from "../src/editor-host/placeholder-mount.ts";
import type { Navigation, RoutePlace } from "../src/handlers/index.ts";
import { INITIAL_SHELL_STATE } from "../src/services/ports.ts";
import type {
  Environment,
  PersonServices,
  ShellState,
} from "../src/services/ports.ts";
import { createPersonServices } from "../src/services/services.ts";
import { createPersonSync } from "../src/services/sync/create-sync.ts";
import type { PersonSync } from "../src/services/sync/create-sync.ts";
import { createDeviceMemory } from "../src/services/sync/device-memory.ts";
import type { StorageEvents } from "../src/services/local-map.ts";
import type { ShellDom } from "../src/shell/regions.tsx";
import { createGuard } from "../src/state/guard.ts";
import { createPersonStore } from "../src/state/person.store.ts";

/** A storage held in memory, as one origin's tabs share it. */
export class MemoryStorage implements Storage {
  [name: string]: unknown;
  readonly #items = new Map<string, string>();
  get length(): number {
    return this.#items.size;
  }
  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.#items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.#items.set(key, value);
  }
  removeItem(key: string): void {
    this.#items.delete(key);
  }
  clear(): void {
    this.#items.clear();
  }
}

/** A storage that refuses every read and write, as a private window may. */
export class RefusingStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new Error("the storage refuses to be read");
  }
  override setItem(): void {
    throw new Error("the storage refuses to be written");
  }
}

/** A storage that reads but refuses every write, as a full one does. */
export class FullStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error("the storage is full");
  }
}

/** The storage events another tab would cause; `fire` sends one to every listener. */
export function createStorageEvents(): {
  events: StorageEvents;
  fire(key: string | null): void;
} {
  const listeners = new Set<(key: string | null) => void>();
  return {
    events(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    fire(key) {
      for (const listener of listeners) listener(key);
    },
  };
}

/** A clock and timers that move only when the test advances them. */
export function createClock(startAt = 0): {
  now: () => number;
  schedule: (fn: () => void, delayMs: number) => () => void;
  advance(ms: number): void;
} {
  let at = startAt;
  let tasks: { at: number; fn: () => void }[] = [];
  return {
    now: () => at,
    schedule(fn, delayMs) {
      const task = { at: at + delayMs, fn };
      tasks.push(task);
      return () => {
        tasks = tasks.filter((t) => t !== task);
      };
    },
    advance(ms) {
      const until = at + ms;
      for (;;) {
        const [due] = tasks
          .filter((t) => t.at <= until)
          .toSorted((a, b) => a.at - b.at);
        if (due === undefined) break;
        tasks = tasks.filter((t) => t !== due);
        at = due.at;
        due.fn();
      }
      at = until;
    },
  };
}

export function fakeApi(overrides: Partial<Api> = {}): Api {
  return {
    choices: async () => [],
    signIn: async () => ({ ok: false, reason: "unreachable" }),
    me: async () => ({ ok: false, reason: "unauthenticated" }),
    demo: async () => null,
    removedDoc: async () => null,
    docClients: async () => ({ clients: [] }),
    ...overrides,
  };
}

/** A router at `at`; `visited` lists every navigation, and `next()` settles with the next one. */
export function createNavigation(at: RoutePlace): {
  navigation: Navigation;
  visited: string[];
  next(): Promise<string>;
} {
  const visited: string[] = [];
  let waiting: ((href: string) => void)[] = [];
  return {
    navigation: {
      navigate(href) {
        visited.push(href);
        const settle = waiting;
        waiting = [];
        for (const resolve of settle) resolve(href);
      },
      here: () => at,
    },
    visited,
    next: () =>
      new Promise((resolve) => {
        waiting.push(resolve);
      }),
  };
}

/** A window with nothing in it: focus is never anywhere and nothing is said. */
export const QUIET_DOM: ShellDom = Object.freeze({
  focusKind: () => "other" as const,
  pageFocused: () => false,
  focusPage: () => false,
  focusNextRegion: () => {},
  focusSidePanel: () => {},
  rememberFocus: () => {},
  restoreFocus: () => {},
  announce: () => {},
});

export const V1: VersionSet = Object.freeze({
  protocol: 1,
  schema: 1,
  engine: 0,
  table: 0,
});

/** The same draws in every run: the middle of the range, and client ids counting up from 7, so a reopened document can take a new one. */
export function fixedRandom(): Random {
  let clientId = 6;
  return {
    next: () => 0.5,
    clientId: () => ++clientId,
    bytes: (length: number) => new Uint8Array(length).fill(7),
  };
}

/**
 * `overrides` over a test tab's environment, whose sync keeps each person's documents in `stores`: a store of its own
 * per sync unless given, as a browser that keeps nothing between loads.
 */
export function testEnvironment(
  overrides: Partial<Environment> = {},
  stores: { store(userId: string): LocalStore } = { store: createMemoryStore },
): Environment {
  const clock = createClock();
  const storage =
    overrides.storage === undefined ? new MemoryStorage() : overrides.storage;
  let ids = 0;
  return {
    where: {
      platform: "mac",
      shell: "web",
      browser: "Chrome",
      system: "macOS",
    },
    desktop: null,
    updateState: createValue<UpdateState | null>(null),
    language: "en-US",
    userAgent: "test",
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => clock.schedule(fn, 16),
    storage,
    storageEvents: createStorageEvents().events,
    tabStorage: null,
    randomId: () => `id-${++ids}`,
    lastKeyAt: () => null,
    guard: createGuard({ flavour: "test" }),
    flavour: "test",
    // the editor is tested over its own mount
    loadEditor: () => Promise.resolve(placeholderMount),
    shellState: createValue<ShellState>(INITIAL_SHELL_STATE),
    dom: QUIET_DOM,
    online: () => true,
    ran: () => {},
    visitUndo: { current: null },
    // a server that never answers: every document opens from its memory store
    startSync: (person, deviceId) =>
      createPersonSync({
        person,
        baseUrl: "http://manent.test",
        deviceId,
        build: "test",
        versions: V1,
        minServer: V1,
        ports: {
          transport: createMemoryNetwork({ random: () => 0 }).transport(
            person.userId,
          ),
          store: stores.store(person.userId),
          leader: soloLeader(deviceId),
          clock: { now: clock.now, schedule: clock.schedule },
          random: fixedRandom(),
          frames: { request: (fn) => clock.schedule(fn, 16) },
        },
        // sync keeps its own values in the tab's storage, as a browser's localStorage
        memory: createDeviceMemory({ local: storage, session: null }),
        onlineEvents: null,
        visible: () => true,
        now: clock.now,
      }),
    personServices: createValue<PersonServices | null>(null),
    ...overrides,
  };
}

/** The services of `userId` in `environment`, at `/` unless a router is given. */
export function testServices(options: {
  userId: string;
  environment?: Environment;
  router?: Navigation;
  api?: Api;
}): PersonServices {
  const environment = options.environment ?? testEnvironment();
  return createPersonServices({
    ...environment,
    person: { token: null, userId: options.userId, name: options.userId },
    demo: createValue(false),
    api: options.api ?? fakeApi(),
    usePerson: createPersonStore(null),
    router:
      options.router ??
      createNavigation({ routeId: "/", href: "/", search: {} }).navigation,
  });
}

/** `environment`, keeping each person's sync it starts in `started`, oldest first. */
export function keepingSyncs(environment: Environment): {
  environment: Environment;
  started: Promise<PersonSync>[];
} {
  const started: Promise<PersonSync>[] = [];
  return {
    environment: {
      ...environment,
      startSync(person, deviceId) {
        const sync = environment.startSync(person, deviceId);
        started.push(sync);
        return sync;
      },
    },
    started,
  };
}

/** Lists `docId` under `title` in a film project of its own in the index of `workspaceId`, as another device would have. */
export async function listDocument(
  sync: PersonSync,
  entry: { workspaceId: string; docId: string; title: string },
): Promise<void> {
  const { workspaceId, docId, title } = entry;
  const handle = await sync.client.open(indexDocId("workspace", workspaceId), {
    create: {
      kind: "index",
      home: workspaceHome(workspaceId),
      workspaceId: null,
    },
  });
  const projectId = `project-${docId}`;
  jsonMap(handle.doc(), "projects").set(projectId, {
    title,
    kind: "film",
    createdAt: 0,
    createdByUserId: "seed",
  });
  jsonMap(handle.doc(), "documents").set(docId, {
    projectId,
    title,
    kind: "script",
    createdAt: 0,
    editedAt: null,
    editedByUserId: null,
  });
  await handle.close();
}
