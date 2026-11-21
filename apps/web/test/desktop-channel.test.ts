import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { CommandService, CommandState } from "@manent/commands";
import { createFakeClock } from "@manent/sync-client/testing";
import {
  connectionAtNode,
  desktopSyncParts,
} from "../src/desktop/desktop-sync.ts";
import { connectShellCommands } from "../src/desktop/shell-channel.ts";
import { createHandlers } from "../src/handlers/index.ts";
import { createPersonSync } from "../src/services/sync/create-sync.ts";
import { createDeviceMemory } from "../src/services/sync/device-memory.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import { fakeHost } from "./desktop.fixtures.ts";
import {
  V1,
  createNavigation,
  fakeApi,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";
import { DANA, createSyncWorld, settle, turn, until } from "./sync.fixtures.ts";

const ORIGIN = "http://127.0.0.1:5123";
const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";

const STATE: CommandState = {
  enabled: true,
  visible: true,
  checked: null,
  label: "Commands",
  keys: [],
  whyNot: null,
};

afterEach(() => mock.restore());

test("a menu command from the shell runs through the service as a native menu run", () => {
  const ran: string[] = [];
  const service: CommandService = {
    run(id, source) {
      ran.push(`${id}:${source}`);
      return "ran";
    },
    state: () => STATE,
    subscribe: () => () => {},
  };
  const host = fakeHost({ platform: "linux" });
  const stop = connectShellCommands({
    host,
    service,
    clock: createFakeClock(0).clock,
  });
  host.emit({ v: 1, t: "menu_command", id: "app.palette" });
  host.emit({ v: 1, t: "update_state", state: "checking" });
  stop();
  host.emit({ v: 1, t: "menu_command", id: "app.goTo" });
  expect([ran, host.sent]).toEqual([["app.palette:native_menu"], []]);
});

test("the native menus follow the person's commands where the system draws them", () => {
  const fake = createFakeClock(0);
  const listeners: (() => void)[] = [];
  const service: CommandService = {
    run: () => "ran",
    state: () => STATE,
    subscribe(listener) {
      listeners.push(listener);
      return () => {};
    },
  };
  const host = fakeHost({ platform: "mac" });
  connectShellCommands({ host, service, clock: fake.clock });
  fake.advance(250);
  const first = host.sent.length;
  for (const listener of listeners) listener();
  fake.advance(250);
  expect([first, host.sent.length, host.sent[0]?.t]).toEqual([1, 1, "menus"]);
});

test("on desktop the window's sync client talks to the node and keeps nothing itself", async () => {
  const sent: string[] = [];
  const fake = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const authorization = new Headers(init?.headers).get("Authorization");
    sent.push(`${init?.method} ${String(input)} ${authorization}`);
    return Response.json({ error: "forbidden" }, { status: 403 });
  };
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(fake, { preconnect: fetch.preconnect }),
  );
  const parts = desktopSyncParts({
    origin: ORIGIN,
    userId: "sam",
    token: () => "node-token",
  });
  await parts.transport.createDocument({
    docId: DOC,
    kind: "script",
    home: `project:${DOC}`,
    workspaceId: null,
  });
  await parts.store.create({
    docId: DOC,
    generation: 0,
    lastServerSeq: 0,
    clientIds: [],
    ackedClocks: {},
    neverSynced: true,
    create: null,
    parked: null,
    recovering: null,
    lastDeviceVersionAt: 0,
    lastSyncedAt: null,
    moving: null,
  });
  const again = desktopSyncParts({
    origin: ORIGIN,
    userId: "sam",
    token: () => "node-token",
  });
  expect([
    parts.via,
    parts.store.userId,
    (await parts.store.load(DOC)) === null,
    await again.store.load(DOC),
    sent,
  ]).toEqual([
    "local_node",
    "sam",
    false,
    null,
    [`POST ${ORIGIN}/api/docs Bearer node-token`],
  ]);
});

test("on desktop the demo's Connection acts on the node", async () => {
  const world = createSyncWorld();
  const sync = await createPersonSync({
    person: DANA,
    baseUrl: ORIGIN,
    deviceId: "device-1",
    build: "test",
    versions: V1,
    minServer: V1,
    ports: world.ports(),
    via: "local_node",
    memory: createDeviceMemory({ local: world.storage, session: null }),
    onlineEvents: null,
    visible: () => true,
    now: world.fake.clock.now,
  });
  await settle(world.network);
  const connects = world.connects();
  const told: [string, number][] = [];
  const host = fakeHost({
    setConnection: async (mode, delayMs) => {
      told.push([mode, delayMs]);
    },
  });
  const control = connectionAtNode(sync.connection, host);
  control.set("offline");
  await settle(world.network);
  const stayed = [world.connects() - connects, sync.link.get().state];
  // the window's link to the node, dropped while Offline, is made again at once
  world.network.partition(true);
  world.network.partition(false);
  await settle(world.network);
  sync.client.retryNow();
  // an asked-for connect waits half the client's jitter at the fixed draw
  world.fake.advance(500);
  await settle(world.network);
  const asked = await sync.throughConnection(async () => "asked");
  control.set("slow");
  control.set("online");
  expect([
    told,
    control.mode.get(),
    stayed,
    [world.connects() - connects, sync.link.get().state],
    asked,
  ]).toEqual([
    [
      ["offline", 0],
      ["slow", 1500],
      ["online", 0],
    ],
    "online",
    [0, "online"],
    [1, "online"],
    "asked",
  ]);
  await sync.dispose();
});

/** The node's answers to the person routes, the cloud signed in once Sign in to sync was asked. */
function nodeAnswering(): string[] {
  const asked: string[] = [];
  let signedIn = false;
  const fake = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const route = `${init?.method ?? "GET"} ${String(input)}`;
    asked.push(route);
    if (route === "POST /api/local/sign-in-to-sync") signedIn = true;
    return Response.json(
      route === "GET /api/local/person"
        ? {
            userId: "sam",
            name: "Sam",
            cloud: signedIn ? "signed_in" : "not_signed_in",
          }
        : { cloud: "signed_in" },
    );
  };
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(fake, { preconnect: fetch.preconnect }),
  );
  return asked;
}

test("on desktop the native menus reach the person's commands, and Sign in to sync is the node's", async () => {
  const asked = nodeAnswering();
  const host = fakeHost({ platform: "linux" });
  const services = testServices({
    userId: "sam",
    environment: testEnvironment({ desktop: host }),
  });
  await turn();
  const before = services.commands.state("app.signInToSync").visible;
  host.emit({ v: 1, t: "menu_command", id: "app.signInToSync" });
  await until(() => asked.length === 3);
  await turn();
  expect([
    before,
    services.commands.state("app.signInToSync").visible,
    asked,
  ]).toEqual([
    true,
    false,
    [
      "GET /api/local/person",
      "POST /api/local/sign-in-to-sync",
      "GET /api/local/person",
    ],
  ]);
  services.dispose();
});

test("Open in browser asks the shell", () => {
  const host = fakeHost();
  const environment = testEnvironment({ desktop: host });
  const handlers = createHandlers({
    ...environment,
    services: testServices({ userId: "sam", environment }),
    api: fakeApi(),
    usePerson: createPersonStore(null),
    router: createNavigation({ routeId: "/", href: "/", search: {} })
      .navigation,
    shellState: environment.shellState.get,
    nodeCloud: null,
  });
  handlers["app.openInBrowser"]();
  expect(host.sent).toEqual([{ v: 1, t: "open_in_browser" }]);
});
