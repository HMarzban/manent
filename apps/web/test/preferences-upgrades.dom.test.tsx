// Preferences & Settings upgrades: desktop Connection/Restart/Copy path, Visit Undo button, rail dots, Account workspaces and Keyboard filter.
import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { entryKey } from "@manent/settings";
import {
  CommandsProvider,
  SettingsProvider,
  TimingProvider,
  createValue,
} from "@manent/ui";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { answerShell } from "../src/desktop/shell-channel.ts";
import { AccountPane } from "../src/screens/preferences/account-pane.tsx";
import { DevicePane } from "../src/screens/preferences/device-pane.tsx";
import { readCustomShortcuts } from "../src/screens/preferences/keyboard-pane.tsx";
import { PreferencesScreen } from "../src/screens/preferences/preferences-screen.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { createPersonServices } from "../src/services/services.ts";
import { INITIAL_SHELL_STATE } from "../src/services/ports.ts";
import type { ShellState } from "../src/services/ports.ts";
import { writePerson } from "../src/session.ts";
import { AppShell, ScreenArea } from "../src/shell/app-shell.tsx";
import { createShellDom } from "../src/shell/regions.tsx";
import { bindGuard } from "../src/state/guard.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import { DATA_DIR, fakeHost } from "./desktop.fixtures.ts";
import {
  MemoryStorage,
  QUIET_DOM,
  createClock,
  createNavigation,
  fakeApi,
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
  Reflect.deleteProperty(navigator, "clipboard");
});

const systemPrefersNothing = (): void => {
  Reflect.set(window, "matchMedia", (media: string) => ({
    media,
    matches: false,
    addEventListener: noop,
    removeEventListener: noop,
  }));
};

function buttonNamed(root: ParentNode, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  if (found === undefined) throw new RangeError(`no button ${text}`);
  return found;
}

function typeInto(input: HTMLInputElement, value: string): void {
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    input.focus();
    set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });
}

test("Desktop DevicePane shows Connection card with live probe, Copy path and Restart to update", async () => {
  systemPrefersNothing();
  const clock = createClock(1_000);
  const host = fakeHost({
    platform: "mac",
    version: "0.2.0",
    channel: "stable",
    dataDir: DATA_DIR,
    storage: async () => ({ scripts: 4, bytes: 3_000_000 }),
  });
  const probes: string[] = [];
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      probes.push(url);
      return Response.json({ online: url.includes("probe=1") });
    },
    { preconnect: () => {} },
  );
  const copied: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        copied.push(text);
      },
    },
  });

  const announced: string[] = [];
  const environment = testEnvironment({
    where: {
      platform: "mac",
      shell: "desktop",
      browser: "Chrome",
      system: "macOS",
    },
    desktop: host,
    storage: new MemoryStorage(),
    now: clock.now,
    schedule: clock.schedule,
    dom: { ...QUIET_DOM, announce: (text) => announced.push(text) },
    shellState: createValue<ShellState>({
      ...INITIAL_SHELL_STATE,
      screen: "preferences",
    }),
  });
  stopAnswering = answerShell({
    host,
    environment,
    pathname: () => "/preferences/device",
  });
  const services = testServices({
    userId: "sam",
    environment,
    router: createNavigation({
      routeId: "/preferences/$pane",
      href: "/preferences/device",
      search: {},
    }).navigation,
  });

  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  await act(async () => {
    mounted!.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <SettingsProvider store={services.settings}>
            <TimingProvider timing={clock}>
              <DevicePane deviceName="Manent for macOS" persisted />
            </TimingProvider>
          </SettingsProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });
  await act(async () => {});

  expect(container.textContent).toContain("Offline · Saved on this device");
  expect(container.textContent).toContain(".fdx, .fountain, .ink, .docx");

  // Check connection probes /api/local/status?probe=1
  await act(async () => {
    buttonNamed(container, "Check connection").click();
  });
  expect(probes).toContain("/api/local/status?probe=1");
  expect(announced).toContain("Online · Syncing with the server");

  // Live SSE flips Connection back to online
  act(() => host.emit({ v: 1, t: "cloud_state", online: true }));
  expect(container.textContent).toContain("Online · Syncing with the server");

  // Copy path copies host.dataDir and resets after 1500 ms
  await act(async () => {
    buttonNamed(container, "Copy path").click();
  });
  expect(copied).toEqual([DATA_DIR]);
  expect(container.textContent).toContain("Copied");
  act(() => clock.advance(1_500));
  expect(container.textContent).toContain("Copy path");

  // Update ready shows Restart to update and sends restart_to_update
  act(() => host.emit({ v: 1, t: "update_state", state: "ready" }));
  act(() => buttonNamed(container, "Restart to update").click());
  expect(host.sent).toContainEqual({ v: 1, t: "restart_to_update" });
});

test("Preferences shows visible Visit Undo button, rail customisation dots and Keyboard filter/reset", async () => {
  systemPrefersNothing();
  const clock = createClock(1_000);
  const environment = testEnvironment({
    dom: createShellDom(document),
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => clock.schedule(fn, 16),
    storage: new MemoryStorage(),
  });
  bindGuard(environment.guard);
  const services = testServices({
    userId: "leo",
    environment,
    router: createNavigation({
      routeId: "/preferences/$pane",
      href: "/preferences/writing?from=%2F",
      search: { from: "/" },
    }).navigation,
  });
  services.keys.set(entryKey("app.palette", "dev-1"), {
    v: ["Mod+Shift+P"],
    at: 1_000,
    on: "Chrome on macOS",
    unset: false,
  });

  const rootRoute = createRootRoute({
    component: () => (
      <AppShell>
        <ScreenArea>
          <Outlet />
        </ScreenArea>
      </AppShell>
    ),
  });
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/preferences/$pane",
      validateSearch: (search: Record<string, unknown>): { from: string } => ({
        from: typeof search.from === "string" ? search.from : "/",
      }),
      component: PreferencesScreen,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ["/preferences/writing?from=%2F"],
    }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  await act(async () => {
    mounted!.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <RouterProvider router={router} />
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });

  // No Undo button before a change; Keyboard tab already carries a modified dot
  expect(
    [...container.querySelectorAll("header button")].some((b) =>
      b.textContent?.includes("Undo"),
    ),
  ).toBe(false);
  const keyboardTab = [...container.querySelectorAll('[role="tab"]')].find(
    (tab) => tab.textContent?.includes("Keyboard"),
  );
  expect(keyboardTab?.querySelector(".mn-setting-dot")).not.toBeNull();

  // Change two writing preferences → Undo (2) appears and steps back cleanly
  const typewriter = container.querySelector<HTMLElement>(
    '[role="switch"][aria-labelledby]',
  )!;
  act(() => typewriter.click());
  expect(services.settings.get("writing.typewriterScrolling")).toBe(true);
  expect(buttonNamed(container, "Undo")).toBeDefined();

  act(() => typewriter.click());
  expect(buttonNamed(container, "Undo (2)")).toBeDefined();

  act(() => buttonNamed(container, "Undo (2)").click());
  expect(services.settings.get("writing.typewriterScrolling")).toBe(true);
  act(() => buttonNamed(container, "Undo").click());
  expect(services.settings.get("writing.typewriterScrolling")).toBe(false);
  expect(
    [...container.querySelectorAll("header button")].some((b) =>
      b.textContent?.includes("Undo"),
    ),
  ).toBe(false);

  // Switch to Keyboard pane: filter narrows commands, Custom only filters custom bindings, Reset shortcuts clears
  await act(() => router.navigate({ href: "/preferences/keyboard?from=%2F" }));
  const filterInput = container.querySelector<HTMLInputElement>(
    'input[aria-label="Filter shortcuts"]',
  )!;
  expect(filterInput).not.toBeNull();
  typeInto(filterInput, "xyznomatch");
  expect(container.textContent).toContain('No shortcut matches "xyznomatch".');
  act(() => buttonNamed(container, "Clear filter").click());
  expect(filterInput.value).toBe("");

  const customBtn = buttonNamed(container, "Custom only (1)");
  act(() => customBtn.click());
  expect(customBtn.getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelectorAll("li").length).toBe(1);

  act(() => buttonNamed(container, "Reset shortcuts").click());
  expect(readCustomShortcuts(services.keys).size).toBe(0);
});

test("AccountPane lists workspaces with roles and opens workspace settings", async () => {
  systemPrefersNothing();
  const host = fakeHost({
    platform: "mac",
    version: "0.2.0",
    channel: "canary",
    dataDir: DATA_DIR,
  });
  const tabStorage = new MemoryStorage();
  const dana = {
    token: "tok-dana",
    userId: "dana",
    name: "Dana Reyes",
  };
  writePerson(tabStorage, dana);
  const usePerson = createPersonStore(tabStorage);
  const environment = testEnvironment({
    where: {
      platform: "mac",
      shell: "desktop",
      browser: "Chrome",
      system: "macOS",
    },
    desktop: host,
    tabStorage,
  });
  const api = fakeApi({
    me: async () => ({
      ok: true,
      me: {
        userId: "dana",
        name: "Dana Reyes",
        workspaces: [
          { id: "room", name: "Writers' room", seeding: null },
          { id: "news", name: "Newsdesk", seeding: null },
        ],
      },
    }),
  });
  const services = createPersonServices({
    ...environment,
    person: dana,
    demo: createValue(true),
    api,
    usePerson,
    router: createNavigation({ routeId: "/", href: "/", search: {} })
      .navigation,
  });
  const opened: string[] = [];

  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  await act(async () => {
    mounted!.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <TimingProvider
            timing={{ now: environment.now, schedule: environment.schedule }}
          >
            <SettingsProvider store={services.settings}>
              <CommandsProvider
                service={services.commands}
                resolved={services.resolved}
                platform="mac"
              >
                <AccountPane onOpenWorkspace={(id) => opened.push(id)} />
              </CommandsProvider>
            </SettingsProvider>
          </TimingProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });
  await act(async () => {});

  expect(container.textContent).toContain("Your workspaces");
  expect(container.textContent).toContain("Writers' room");
  expect(container.textContent).toContain("Newsdesk");
  const wsButtons = [...container.querySelectorAll("button")].filter(
    (b) => b.textContent?.trim() === "Workspace settings",
  );
  expect(wsButtons.length).toBe(2);
  act(() => wsButtons[0]!.click());
  expect(opened).toEqual(["room"]);

  // Offline state adds calm offline notice on desktop
  act(() => host.emit({ v: 1, t: "cloud_state", online: false }));
  expect(container.textContent).toContain(
    "Every change saves on this device first and syncs when the server is online.",
  );
  services.dispose();
});
