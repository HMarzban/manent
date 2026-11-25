import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { soloLeader } from "@manent/sync-client";
import {
  createMemoryNetwork,
  createMemoryStore,
} from "@manent/sync-client/testing";
import { SettingsProvider, TimingProvider, createValue } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { Api } from "../src/api.ts";
import { desktopDeviceRows } from "../src/desktop/device-rows.ts";
import type { DesktopHost } from "../src/desktop/host.ts";
import { answerShell } from "../src/desktop/shell-channel.ts";
import { DevicePane } from "../src/screens/preferences/device-pane.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { INITIAL_SHELL_STATE } from "../src/services/ports.ts";
import type { PersonServices, ShellState } from "../src/services/ports.ts";
import { createPersonSync } from "../src/services/sync/create-sync.ts";
import { createDeviceMemory } from "../src/services/sync/device-memory.ts";
import { writePerson } from "../src/session.ts";
import { DATA_DIR, fakeHost } from "./desktop.fixtures.ts";
import type { FakeHost } from "./desktop.fixtures.ts";
import {
  MemoryStorage,
  QUIET_DOM,
  V1,
  createClock,
  createNavigation,
  fakeApi,
  fixedRandom,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

const noop = (): void => {};
const realFetch = globalThis.fetch;
let mounted: Root | null = null;
let stopAnswering = noop;
afterEach(() => {
  globalThis.fetch = realFetch;
  act(() => mounted?.unmount());
  mounted = null;
  stopAnswering();
  stopAnswering = noop;
  document.body.replaceChildren();
});

/**
 * This device's pane, in the desktop app when `host` is given (with the window answering the shell), on the web
 * otherwise; `visited` lists every navigation, and `close` and `open` take the pane away and draw it again.
 */
async function devicePane(options: {
  host: FakeHost | null;
  announced?: string[];
  nowStart?: number;
  token?: string;
  api?: Api;
}): Promise<{
  container: HTMLElement;
  services: PersonServices;
  visited: string[];
  advance(ms: number): void;
  close(): void;
  open(): Promise<void>;
}> {
  // a system that prefers nothing
  Reflect.set(window, "matchMedia", (media: string) => ({
    media,
    matches: false,
    addEventListener: noop,
    removeEventListener: noop,
  }));
  const clock = createClock(options.nowStart ?? 0);
  const { host } = options;
  const tabStorage = options.token === undefined ? null : new MemoryStorage();
  if (tabStorage !== null && options.token !== undefined)
    writePerson(tabStorage, {
      token: options.token,
      userId: "sam",
      name: "Sam Okafor",
    });
  const storage = new MemoryStorage();
  let draw = 0;
  const baseRandom = fixedRandom();
  const environment = testEnvironment({
    where: {
      platform: "mac",
      shell: host === null ? "web" : "desktop",
      browser: "Chrome",
      system: "macOS",
    },
    desktop: host,
    storage,
    tabStorage,
    now: clock.now,
    schedule: clock.schedule,
    dom: { ...QUIET_DOM, announce: (text) => options.announced?.push(text) },
    shellState: createValue<ShellState>({
      ...INITIAL_SHELL_STATE,
      screen: "preferences",
    }),
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
          store: createMemoryStore(person.userId),
          leader: soloLeader(deviceId),
          clock: { now: clock.now, schedule: clock.schedule },
          random: {
            ...baseRandom,
            bytes: (length) => new Uint8Array(length).fill(++draw),
          },
          frames: { request: (fn) => clock.schedule(fn, 16) },
        },
        memory: createDeviceMemory({ local: storage, session: null }),
        onlineEvents: null,
        visible: () => true,
        now: clock.now,
      }),
  });
  const route = createNavigation({
    routeId: "/preferences/$pane",
    href: "/preferences/device",
    search: {},
  });
  if (host !== null)
    stopAnswering = answerShell({
      host,
      environment,
      pathname: () => "/preferences/device",
    });
  const services = testServices({
    userId: "sam",
    environment,
    router: route.navigation,
    ...(options.api === undefined ? {} : { api: options.api }),
  });
  const container = document.createElement("div");
  document.body.append(container);
  const open = async (): Promise<void> => {
    mounted = createRoot(container);
    await act(async () =>
      mounted?.render(
        <EnvironmentProvider environment={environment}>
          <ServicesProvider services={services}>
            <SettingsProvider store={services.settings}>
              <TimingProvider timing={clock}>
                <DevicePane deviceName="Manent for macOS" persisted />
              </TimingProvider>
            </SettingsProvider>
          </ServicesProvider>
        </EnvironmentProvider>,
      ),
    );
  };
  await open();
  return {
    container,
    services,
    visited: route.visited,
    advance: (ms) => act(() => clock.advance(ms)),
    close() {
      act(() => mounted?.unmount());
      mounted = null;
    },
    open,
  };
}

// on Linux, where no native menu is sent beside what the pane sends
const desktopHost = (overrides: Partial<DesktopHost> = {}): FakeHost =>
  fakeHost({
    platform: "linux",
    version: "0.1.0",
    channel: "canary",
    dataDir: DATA_DIR,
    ...overrides,
  });

/** The elements whose own text is `text`. */
const texts = (container: HTMLElement, text: string): Element[] =>
  [...container.querySelectorAll("*")].filter(
    (element) =>
      element.textContent === text &&
      [...element.children].every((child) => child.textContent !== text),
  );

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (each) => each.textContent === name,
  );
  if (found === undefined) throw new RangeError(`no button ${name}`);
  return found;
}

test("This device on desktop says what is stored and where, and which version runs", async () => {
  const { container } = await devicePane({
    host: desktopHost({
      storage: async () => ({ scripts: 14, bytes: 23_000_000 }),
    }),
  });
  await act(async () => {});
  expect(
    [
      "Stored here",
      "Scripts",
      "14 scripts · 23 MB",
      "Show in Library",
      "Folder",
      DATA_DIR,
      "Show folder",
      "Manent 0.1.0",
      "Channel",
      "Canary",
      "Check for updates",
    ].map((text) => [text, texts(container, text).length]),
  ).toEqual(
    [
      "Stored here",
      "Scripts",
      "14 scripts · 23 MB",
      "Show in Library",
      "Folder",
      DATA_DIR,
      "Show folder",
      "Manent 0.1.0",
      "Channel",
      "Canary",
      "Check for updates",
    ].map((text) => [text, 1]),
  );
  expect(
    [
      "Export everything on this device…",
      "Kept in this browser. It may clear Manent's data.",
    ].map((text) => texts(container, text).length),
  ).toEqual([1, 0]);
});

test("Show in Library goes to the Library, and Show folder asks the shell and reads the storage again", async () => {
  let reads = 0;
  const host = desktopHost({
    async storage() {
      reads += 1;
      return { scripts: reads, bytes: 2_000_000 };
    },
  });
  const { container, visited } = await devicePane({ host });
  await act(async () => {});
  await act(async () => button(container, "Show folder").click());
  act(() => button(container, "Show in Library").click());
  expect([
    host.sent,
    reads,
    texts(container, "2 scripts · 2 MB").length,
    visited,
  ]).toEqual([[{ v: 1, t: "show_folder" }], 2, 1, ["/"]]);
});

test("Check for updates asks the shell and shows its answer", async () => {
  const host = desktopHost();
  const announced: string[] = [];
  const { container, advance } = await devicePane({ host, announced });
  act(() => button(container, "Check for updates").click());
  const checking = button(container, "Checking for updates…");
  const disabled = checking.getAttribute("aria-disabled");
  const spinnerAt = [checking.querySelector("svg") !== null];
  advance(400);
  spinnerAt.push(checking.querySelector("svg") !== null);
  act(() => host.emit({ v: 1, t: "update_state", state: "up_to_date" }));
  const upToDate = texts(container, "Manent is up to date.").length;
  act(() => host.emit({ v: 1, t: "update_state", state: "check_failed" }));
  expect({
    sent: host.sent,
    checking: [disabled, spinnerAt],
    upToDate,
    failed: texts(container, "Couldn't check for updates. Try again later.")
      .length,
    ready: button(container, "Check for updates").getAttribute("aria-disabled"),
    announced,
  }).toEqual({
    sent: [{ v: 1, t: "check_for_updates" }],
    checking: ["true", [false, true]],
    upToDate: 1,
    failed: 1,
    ready: "false",
    announced: [
      "Manent is up to date.",
      "Couldn't check for updates. Try again later.",
    ],
  });
});

test("the update line keeps the window's last answer, heard while This device was closed, without saying it again", async () => {
  const host = desktopHost();
  const announced: string[] = [];
  const { container, close, open } = await devicePane({ host, announced });
  close();
  host.emit({ v: 1, t: "update_state", state: "ready" });
  await open();
  expect([
    texts(container, "Update ready — installs the next time Manent starts")
      .length,
    announced,
  ]).toEqual([1, []]);
});

test("a store under a megabyte reads as 1 MB", async () => {
  const { container } = await devicePane({
    host: desktopHost({
      storage: async () => ({ scripts: 3, bytes: 200_000 }),
    }),
  });
  await act(async () => {});
  expect(texts(container, "3 scripts · 1 MB").length).toBe(1);
});

test("the web shows none of the desktop rows", async () => {
  const { container } = await devicePane({ host: null });
  expect(
    [
      "Scripts",
      "Folder",
      "Show in Library",
      "Show folder",
      "Channel",
      "Check for updates",
      "Stored here",
    ].map((text) => texts(container, text).length),
  ).toEqual([0, 0, 0, 0, 0, 0, 1]);
});

const rows = (
  channel: "stable" | "canary",
  usage: { scripts: number; bytes: number } | null,
  update: "checking" | "up_to_date" | "ready" | "check_failed" | null,
) =>
  desktopDeviceRows({
    host: { version: "0.1.0", channel, dataDir: DATA_DIR },
    usage,
    update,
  });

test("the rows follow what the node stores and each answer of the update check", () => {
  expect([
    rows("stable", null, null),
    rows("canary", { scripts: 1, bytes: 1_499_999 }, "checking"),
    rows("stable", { scripts: 1_200, bytes: 2_345_600_000 }, "ready"),
    rows("stable", null, "up_to_date").update,
    rows("stable", null, "check_failed").update,
  ]).toEqual([
    {
      stored: null,
      version: "Manent 0.1.0",
      channel: "Stable",
      update: { busy: false, line: null },
    },
    {
      stored: { scripts: "1 script · 1 MB", folder: DATA_DIR },
      version: "Manent 0.1.0",
      channel: "Canary",
      update: { busy: true, line: null },
    },
    {
      stored: { scripts: "1,200 scripts · 2,346 MB", folder: DATA_DIR },
      version: "Manent 0.1.0",
      channel: "Stable",
      update: {
        busy: false,
        line: "Update ready — installs the next time Manent starts",
      },
    },
    { busy: false, line: "Manent is up to date." },
    { busy: false, line: "Couldn't check for updates. Try again later." },
  ]);
});

test("Export everything on this device stays silent when the person cancels the folder picker", async () => {
  const host = desktopHost({
    storage: async () => ({ scripts: 2, bytes: 1_000_000 }),
  });
  let exportPosts = 0;
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/local/export-file")) exportPosts += 1;
      return new Response(null, { status: 204 });
    },
    { preconnect: () => {} },
  );
  const { container, services } = await devicePane({ host });
  await act(async () => {});
  act(() => button(container, "Export everything on this device…").click());
  expect(host.sent).toEqual([{ v: 1, t: "choose_directory" }]);
  await act(async () => {
    host.emit({ v: 1, t: "directory_chosen", path: null });
    await Promise.resolve();
  });
  expect([
    exportPosts,
    services.messages.current(),
    button(container, "Export everything on this device…").getAttribute(
      "aria-disabled",
    ),
  ]).toEqual([0, null, "false"]);
});

test("Export everything on this device posts each project archive sequentially and reports the folder", async () => {
  const host = desktopHost({
    storage: async () => ({ scripts: 2, bytes: 2_000_000 }),
  });
  const nov17 = new Date(2026, 10, 17, 12, 0, 0).getTime();
  const api = fakeApi({
    me: async () => ({
      ok: true,
      me: {
        userId: "sam",
        name: "Sam Okafor",
        workspaces: [
          { id: "studio", name: "Lanternfield", role: "owner", seeding: null },
        ],
      },
    }),
  });
  const { container, services } = await devicePane({
    host,
    nowStart: nov17,
    token: "tok-export",
    api,
  });
  await services.ready;
  await services.library.createProject("studio", "film");
  await services.library.createProject("sam", "film");
  await act(async () => {});

  const requests: {
    url: string;
    auth: string | null;
    body: { folder: string; subfolder: string; name: string; bytes: string };
  }[] = [];
  let releaseFirst: (() => void) | null = null;
  const firstArrived = Promise.withResolvers<void>();
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (!url.endsWith("/api/local/export-file"))
        return new Response(null, { status: 404 });
      const headers = new Headers(init?.headers);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        folder: string;
        subfolder: string;
        name: string;
        bytes: string;
      };
      requests.push({ url, auth: headers.get("authorization"), body });
      if (requests.length === 1) {
        firstArrived.resolve();
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return new Response(null, { status: 204 });
    },
    { preconnect: () => {} },
  );

  act(() => button(container, "Export everything on this device…").click());
  await act(async () => {
    host.emit({ v: 1, t: "directory_chosen", path: "/Users/sam/Exports" });
    await firstArrived.promise;
  });

  const busy = button(container, "Exporting 2 projects…");
  expect(busy.getAttribute("aria-disabled")).toBe("true");
  expect(requests.length).toBe(1);

  await act(async () => {
    releaseFirst?.();
    await new Promise((resolve) => setTimeout(resolve, 25));
  });

  expect(requests.length).toBe(2);
  expect(requests.map((entry) => [entry.url, entry.auth])).toEqual([
    ["/api/local/export-file", "Bearer tok-export"],
    ["/api/local/export-file", "Bearer tok-export"],
  ]);
  expect(
    requests.map((entry) => [
      entry.body.folder,
      entry.body.subfolder,
      entry.body.name,
    ]),
  ).toEqual([
    ["/Users/sam/Exports", "Manent export 17 Nov 2026", "Untitled film.zip"],
    [
      "/Users/sam/Exports",
      "Manent export 17 Nov 2026",
      "Untitled film (2).zip",
    ],
  ]);
  for (const entry of requests) {
    const zipBytes = Uint8Array.fromBase64(entry.body.bytes);
    expect(zipBytes.slice(0, 4)).toEqual(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    );
  }
  expect(services.messages.current()?.text).toBe(
    "Exported 2 projects to 'Manent export 17 Nov 2026'.",
  );
  expect(
    button(container, "Export everything on this device…").getAttribute(
      "aria-disabled",
    ),
  ).toBe("false");
});

test("Export everything on this device reports refusal when writing fails", async () => {
  const host = desktopHost({
    storage: async () => ({ scripts: 1, bytes: 1_000_000 }),
  });
  const { container, services } = await devicePane({
    host,
    token: "tok-export",
  });
  await services.ready;
  await services.library.createProject("sam", "film");
  await act(async () => {});

  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (!url.endsWith("/api/local/export-file"))
        return new Response(null, { status: 404 });
      return Response.json({ error: "unreachable" }, { status: 500 });
    },
    { preconnect: () => {} },
  );

  act(() => button(container, "Export everything on this device…").click());
  await act(async () => {
    host.emit({ v: 1, t: "directory_chosen", path: "/Users/sam/Exports" });
    await new Promise((resolve) => setTimeout(resolve, 25));
  });

  expect(services.messages.current()?.text).toBe(
    "Couldn't export everything. Try again.",
  );
  expect(
    button(container, "Export everything on this device…").getAttribute(
      "aria-disabled",
    ),
  ).toBe("false");
});
