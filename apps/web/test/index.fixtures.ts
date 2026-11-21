// People's services over one memory network and a server running the sync service over memory storage, on one fake clock:
// each tab of a person has its own storage view of one browser, and the same store.
import { ConnectError, StoreError, soloLeader } from "@manent/sync-client";
import type {
  LeaderPort,
  LocalStore,
  Random,
  Transport,
} from "@manent/sync-client";
import { createFaultyStoreSpace } from "@manent/sync-client/testing";
import type { FaultyStoreSpace } from "@manent/sync-client/testing";
import { indexDocId, workspaceHome } from "@manent/sync-protocol";
import type { DocRole, WorkspaceRef } from "@manent/sync-protocol";
import { createWorld } from "@manent/testkit";
import type { World } from "@manent/testkit";
import { createValue } from "@manent/ui";
import type { Api } from "../src/api.ts";
import type { PersonServices } from "../src/services/ports.ts";
import { createPersonServices } from "../src/services/services.ts";
import { createPersonSync } from "../src/services/sync/create-sync.ts";
import type { PersonSync } from "../src/services/sync/create-sync.ts";
import { createDeviceMemory } from "../src/services/sync/device-memory.ts";
import type { TabPerson } from "../src/session.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import {
  MemoryStorage,
  QUIET_DOM,
  V1,
  createNavigation,
  fakeApi,
  testEnvironment,
} from "./services.fixtures.ts";

export const SAM: TabPerson = Object.freeze({
  token: "token-sam",
  userId: "sam",
  name: "Sam Okafor",
});
export const DANA: TabPerson = Object.freeze({
  token: "token-dana",
  userId: "dana",
  name: "Dana Reyes",
});

/** One person's services in one tab, and the sync they run over. */
export type TabServices = PersonServices & { sync: PersonSync };

export interface IndexWorld {
  world: World;
  /** Each browser's store of a person: `device` names the browser, "main" unless given. */
  space(device?: string): FaultyStoreSpace;
  /** The person's services in a tab of their browser; `leader` decides which of their tabs leads. */
  personServices(options: {
    person: TabPerson;
    leader?: LeaderPort;
    storage?: MemoryStorage;
    device?: string;
    api?: Partial<Api>;
    /** Told what the tab says aloud. */
    announce?: (text: string) => void;
  }): Promise<TabServices>;
  /** Delivers everything and runs what is due, until nothing moves. */
  settleAll(): Promise<void>;
  /** Requests and connections that reached the server. */
  serverContacts(): number;
  /** The file the server keeps a document in, as `kind:id`; null for one it does not hold. */
  serverHomeOf(docId: string): string | null;
  /** While on, every device refuses to store a change of `userId`'s private index, and stores everything else. */
  refusePrivateIndex(userId: string, refuse: boolean): void;
  /** The seed's workspace index, with these roles on it; the first is its owner. */
  seedWorkspace(
    workspaceId: string,
    roles: readonly [string, DocRole][],
  ): Promise<void>;
}

/** What the server lists for every signed-in person. */
const ROOM: readonly WorkspaceRef[] = Object.freeze([
  { id: "medium", name: "Writers' room", seeding: null },
]);

/** `store`, refusing to append to the documents `refused` names. */
function refusing(store: LocalStore, refused: ReadonlySet<string>): LocalStore {
  return new Proxy(store, {
    get(target, key) {
      if (key === "append")
        return (docId: string, entry: Parameters<LocalStore["append"]>[1]) =>
          refused.has(docId)
            ? Promise.reject(new StoreError("quota"))
            : target.append(docId, entry);
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** A canonical UUID per draw, counting up. */
function uuids(): () => string {
  let n = 0;
  return () =>
    `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
}

/** Draws shared by every tab of the world, so no two documents share a client id or an id. */
function worldRandom(): Random {
  let clientId = 100;
  let draws = 0;
  return {
    next: () => 0.5,
    clientId: () => ++clientId,
    bytes: (length: number) =>
      Uint8Array.from({ length }, (_, i) => (i === 0 ? ++draws % 256 : 7)),
  };
}

export async function createIndexWorld(): Promise<IndexWorld> {
  // the world's own script and its one user are never opened here
  const world = await createWorld({
    seed: 1,
    users: ["seed"],
    devicesPerUser: 0,
  });
  const spaces = new Map<string, FaultyStoreSpace>();
  const space = (device = "main"): FaultyStoreSpace => {
    const known = spaces.get(device) ?? createFaultyStoreSpace();
    spaces.set(device, known);
    return known;
  };
  const browsers = new Map<string, MemoryStorage>();
  const { clock } = world.clock;
  const random = worldRandom();
  const refused = new Set<string>();
  let contacts = 0;
  let tabs = 0;
  /** The network as a browser reaches it: nothing leaves without a session. */
  const transport = (person: TabPerson): Transport => {
    const network = world.network.transport(person.userId);
    const signedIn = (): void => {
      if (person.token === null) throw new ConnectError("sign_in");
      contacts += 1;
    };
    return {
      async connect(handlers) {
        signedIn();
        return network.connect(handlers);
      },
      async createDocument(request) {
        signedIn();
        return network.createDocument(request);
      },
      async replay(request) {
        signedIn();
        return network.replay(request);
      },
    };
  };
  return {
    world,
    space,
    async personServices(options) {
      const { person } = options;
      const browser = `${options.device ?? "main"}|${person.userId}`;
      const storage =
        options.storage ?? browsers.get(browser) ?? new MemoryStorage();
      browsers.set(browser, storage);
      const started: { sync: Promise<PersonSync> | null } = { sync: null };
      const services = createPersonServices({
        ...testEnvironment({
          now: clock.now,
          schedule: clock.schedule,
          storage,
          randomId: uuids(),
          language: "en-GB",
          dom: { ...QUIET_DOM, announce: options.announce ?? (() => {}) },
          startSync: (tabPerson, deviceId) => {
            started.sync = createPersonSync({
              person: tabPerson,
              baseUrl: "http://manent.test",
              deviceId,
              build: "test",
              versions: V1,
              minServer: V1,
              ports: {
                transport: transport(tabPerson),
                store: refusing(
                  space(options.device).store(tabPerson.userId),
                  refused,
                ),
                leader: options.leader ?? soloLeader(`tab-${++tabs}`),
                clock,
                random,
                frames: { request: (fn) => clock.schedule(fn, 16) },
              },
              memory: createDeviceMemory({ local: storage, session: null }),
              onlineEvents: null,
              visible: () => true,
              now: clock.now,
            });
            return started.sync;
          },
        }),
        person,
        demo: createValue(false),
        api: fakeApi({
          me: async () => ({
            ok: true,
            me: { userId: person.userId, name: person.name, workspaces: ROOM },
          }),
          ...options.api,
        }),
        usePerson: createPersonStore(null),
        router: createNavigation({ routeId: "/", href: "/", search: {} })
          .navigation,
      });
      if (started.sync === null)
        throw new RangeError("the services started no sync");
      return { ...services, sync: await started.sync };
    },
    settleAll: () => world.settle(),
    serverContacts: () => contacts,
    refusePrivateIndex(userId, refuse) {
      const docId = indexDocId("user", userId);
      if (refuse) refused.add(docId);
      else refused.delete(docId);
    },
    serverHomeOf(docId) {
      const place = world.storage.directory.placeOf(docId);
      return place === null ? null : `${place.home.kind}:${place.home.id}`;
    },
    async seedWorkspace(workspaceId, roles) {
      const [owner, ...others] = roles;
      if (owner === undefined) throw new RangeError("a workspace has an owner");
      const docId = indexDocId("workspace", workspaceId);
      await world.network.transport(owner[0]).createDocument({
        docId,
        kind: "index",
        home: workspaceHome(workspaceId),
        workspaceId: null,
      });
      for (const [userId, role] of others)
        world.storage.directory.setRole(docId, userId, role, []);
    },
  };
}
