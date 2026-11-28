import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import type { PageMessage, ShellMessage } from "@manent/sync-protocol";
import { DESKTOP_WORDS, MENU_WORDS } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  DesktopTitleBar,
  formatWindowContext,
  windowKeyForPath,
} from "../src/desktop/desktop-title-bar.tsx";
import type { DesktopHost } from "../src/desktop/host.ts";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { Environment, PersonServices } from "../src/services/ports.ts";
import { bindGuard } from "../src/state/guard.ts";
import { paletteActions } from "../src/state/palette.store.ts";
import { testEnvironment, testServices } from "./services.fixtures.ts";

withDom();

let mounted: Root | null = null;
const disposers: (() => void)[] = [];
const originalFetch = globalThis.fetch;

afterEach(async () => {
  await act(async () => {
    mounted?.unmount();
  });
  mounted = null;
  while (disposers.length > 0) disposers.pop()?.();
  globalThis.fetch = originalFetch;
  document.body.replaceChildren();
  document.title = "";
});

function fakeDesktop(platform: DesktopHost["platform"]): {
  host: DesktopHost;
  sent: PageMessage[];
  emit(message: ShellMessage): void;
} {
  const sent: PageMessage[] = [];
  const listeners = new Set<(message: ShellMessage) => void>();
  const host: DesktopHost = {
    platform,
    version: "0.0.0",
    channel: "stable",
    dataDir: "/tmp/manent",
    send(message) {
      sent.push(message);
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    firstPaint() {},
    openInBrowser() {},
    openFiles() {},
    async setConnection() {},
    async storage() {
      return null;
    },
  };
  return {
    host,
    sent,
    emit(message) {
      for (const listener of listeners) listener(message);
    },
  };
}

async function mountBar(options: {
  desktop: DesktopHost | null;
  bare?: boolean;
  environment?: Environment;
  services?: PersonServices | null;
  pathname?: string;
}): Promise<{ host: HTMLDivElement; env: Environment }> {
  const host = document.createElement("div");
  document.body.append(host);
  const env =
    options.environment ?? testEnvironment({ desktop: options.desktop });
  const content =
    options.services === undefined || options.services === null ? (
      <DesktopTitleBar bare={options.bare} pathname={options.pathname} />
    ) : (
      <ServicesProvider services={options.services}>
        <DesktopTitleBar bare={options.bare} pathname={options.pathname} />
      </ServicesProvider>
    );
  mounted = createRoot(host);
  await act(async () => {
    mounted!.render(
      <EnvironmentProvider environment={env}>{content}</EnvironmentProvider>,
    );
  });
  return { host, env };
}

test("formatWindowContext strips redundant brand and demo suffixes and empty titles", () => {
  expect([
    formatWindowContext(""),
    formatWindowContext("Manent"),
    formatWindowContext("Manent demo"),
    formatWindowContext("Library — Manent"),
    formatWindowContext("Library — Manent demo"),
    formatWindowContext("The Salt Almanac — Manent"),
    formatWindowContext("The Salt Almanac — Dana Reyes — Manent demo"),
    formatWindowContext("The Salt Almanac · Manent"),
    formatWindowContext("Choose who you are"),
  ]).toEqual([
    null,
    null,
    null,
    "Library",
    "Library",
    "The Salt Almanac",
    "The Salt Almanac — Dana Reyes",
    "The Salt Almanac",
    "Choose who you are",
  ]);
});

test("DesktopTitleBar renders nothing on the web or on Linux desktop", async () => {
  const { host: webHost } = await mountBar({ desktop: null });
  expect(webHost.querySelector('[data-surface="desktop-titlebar"]')).toBeNull();
  await act(async () => {
    mounted?.unmount();
  });
  mounted = null;

  const linux = fakeDesktop("linux");
  const { host: linuxHost } = await mountBar({ desktop: linux.host });
  expect(
    linuxHost.querySelector('[data-surface="desktop-titlebar"]'),
  ).toBeNull();
  expect(linux.sent).toEqual([]);
});

test("macOS titlebar reserves left traffic-light inset, syncs deduplicated window titles, collapses in fullscreen, and toggles zoom on double-click", async () => {
  document.title = "The Salt Almanac — Manent";
  const mac = fakeDesktop("mac");
  const { host } = await mountBar({ desktop: mac.host });

  const bar = host.querySelector<HTMLElement>(
    '[data-surface="desktop-titlebar"]',
  );
  expect(bar?.getAttribute("data-platform")).toBe("mac");
  expect(bar?.textContent).toContain("Manent");
  expect(bar?.textContent).toContain("The Salt Almanac");
  expect(host.querySelector('[data-slot="windows-controls"]')).toBeNull();
  expect(mac.sent).toEqual([
    { v: 1, t: "window_title", title: "The Salt Almanac — Manent" },
  ]);

  // Setting a new title syncs once; repeating the same title does not spam the shell.
  await act(async () => {
    document.title = "Library — Manent demo";
    await Promise.resolve();
  });
  await act(async () => {
    document.title = "Library — Manent demo";
    await Promise.resolve();
  });
  expect(bar?.textContent).toContain("Library");
  expect(bar?.textContent).not.toContain("demo");
  expect(mac.sent).toEqual([
    { v: 1, t: "window_title", title: "The Salt Almanac — Manent" },
    { v: 1, t: "window_title", title: "Library — Manent demo" },
  ]);

  const inset = host.querySelector('[data-slot="mac-traffic-lights"]');
  expect(inset?.className).toContain("w-20");

  await act(async () => {
    mac.emit({
      v: 1,
      t: "window_state",
      maximised: false,
      fullScreen: true,
      focused: false,
    });
  });
  expect(bar?.getAttribute("data-fullscreen")).toBe("true");
  expect(bar?.getAttribute("data-focused")).toBe("false");
  expect(inset?.className).toContain("w-3");

  await act(async () => {
    bar?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  expect(mac.sent.at(-1)).toEqual({
    v: 1,
    t: "window_action",
    action: "toggle_maximize",
  });
});

test("DesktopTitleBar shows offline pill on cloud_state and /api/local/status, and clears when back online", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ online: true, mode: "online" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;

  document.title = "Library — Manent";
  const mac = fakeDesktop("mac");
  const { host } = await mountBar({ desktop: mac.host });

  expect(host.querySelector('[data-tone="offline"]')).toBeNull();

  await act(async () => {
    mac.emit({ v: 1, t: "cloud_state", online: false });
  });
  const offlinePill = host.querySelector<HTMLElement>('[data-tone="offline"]');
  expect(offlinePill).not.toBeNull();
  expect(offlinePill?.getAttribute("role")).toBe("status");
  expect(offlinePill?.textContent).toContain(DESKTOP_WORDS.offlineBadge);

  // Double-clicking inside the status cluster must not maximise the window.
  const sentBefore = mac.sent.length;
  await act(async () => {
    offlinePill?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  expect(mac.sent.length).toBe(sentBefore);

  await act(async () => {
    mac.emit({ v: 1, t: "cloud_state", online: true });
  });
  expect(host.querySelector('[data-tone="offline"]')).toBeNull();

  // Browser offline / online events also drive the offline pill cleanly.
  await act(async () => {
    window.dispatchEvent(new Event("offline"));
  });
  expect(host.querySelector('[data-tone="offline"]')).not.toBeNull();
  await act(async () => {
    window.dispatchEvent(new Event("online"));
  });
  expect(host.querySelector('[data-tone="offline"]')).toBeNull();
});

test("DesktopTitleBar reads initial offline status from /api/local/status on mount", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ online: false, mode: "offline" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;

  const mac = fakeDesktop("mac");
  const { host } = await mountBar({ desktop: mac.host });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(host.querySelector('[data-tone="offline"]')).not.toBeNull();
});

test("DesktopTitleBar shows Restart to update pill when updateState is ready and sends restart_to_update on click", async () => {
  document.title = "Library — Manent";
  const mac = fakeDesktop("mac");
  const { host, env } = await mountBar({ desktop: mac.host });

  expect(host.querySelector('[data-tone="update"]')).toBeNull();

  await act(async () => {
    env.updateState.set("ready");
  });

  const updateButton = host.querySelector<HTMLButtonElement>(
    'button[data-tone="update"]',
  );
  expect(updateButton).not.toBeNull();
  expect(updateButton?.textContent).toBe(DESKTOP_WORDS.restartToUpdate);

  await act(async () => {
    updateButton?.click();
  });
  expect(mac.sent.at(-1)).toEqual({ v: 1, t: "restart_to_update" });
});

test("Windows titlebar renders caption controls, hides on bare Present routes, and shows App Menu only when services are present", async () => {
  document.title = "Library — Manent";
  const win = fakeDesktop("windows");
  const { host } = await mountBar({ desktop: win.host });

  const bar = host.querySelector<HTMLElement>(
    '[data-surface="desktop-titlebar"]',
  );
  expect(bar?.getAttribute("data-platform")).toBe("windows");
  // Outside ServicesProvider (e.g. Choose screen): App Menu trigger is omitted cleanly.
  expect(host.querySelector('[data-slot="windows-app-menu"]')).toBeNull();

  const controls = host.querySelector('[data-slot="windows-controls"]');
  const buttons = [...(controls?.querySelectorAll("button") ?? [])];
  expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
    DESKTOP_WORDS.minimizeWindow,
    DESKTOP_WORDS.maximizeWindow,
    DESKTOP_WORDS.closeWindow,
  ]);

  await act(async () => {
    buttons[0]!.click();
    buttons[1]!.click();
    buttons[2]!.click();
  });
  expect(win.sent).toEqual([
    { v: 1, t: "window_title", title: "Library — Manent" },
    { v: 1, t: "window_action", action: "minimize" },
    { v: 1, t: "window_action", action: "toggle_maximize" },
    { v: 1, t: "window_action", action: "close" },
  ]);

  await act(async () => {
    win.emit({
      v: 1,
      t: "window_state",
      maximised: true,
      fullScreen: false,
      focused: true,
    });
  });
  expect(buttons[1]?.getAttribute("aria-label")).toBe(
    DESKTOP_WORDS.restoreWindow,
  );

  // Inside ServicesProvider: Windows App Menu trigger renders and exposes Command palette + top menus.
  await act(async () => {
    mounted?.unmount();
  });
  mounted = null;
  const ran: string[] = [];
  const env = testEnvironment({
    desktop: win.host,
    ran: (id) => ran.push(id),
  });
  bindGuard(env.guard);
  const services = testServices({ userId: "dana", environment: env });
  disposers.push(() => {
    paletteActions.close();
    services.dispose();
  });
  const { host: withServicesHost } = await mountBar({
    desktop: win.host,
    environment: env,
    services,
  });

  const menuTrigger = withServicesHost.querySelector<HTMLButtonElement>(
    '[data-slot="windows-app-menu"]',
  );
  expect(menuTrigger).not.toBeNull();
  expect(menuTrigger?.getAttribute("aria-label")).toBe(DESKTOP_WORDS.appMenu);

  await act(async () => {
    menuTrigger?.click();
  });
  const menuText = document.body.textContent ?? "";
  expect(menuText).toContain(DESKTOP_WORDS.commandPalette);
  expect(menuText).toContain(MENU_WORDS.file);
  expect(menuText).toContain(MENU_WORDS.help);

  const paletteItem = [
    ...document.body.querySelectorAll<HTMLElement>(
      '[data-slot="dropdown-menu-item"]',
    ),
  ].find((el) => el.textContent?.includes(DESKTOP_WORDS.commandPalette));
  expect(paletteItem).toBeDefined();
  await act(async () => {
    paletteItem?.click();
  });
  expect(ran).toContain("app.palette");

  // secondary Present windows on Windows render unified custom chrome without the App Menu and route actions by windowKey
  await act(async () => {
    mounted?.unmount();
  });
  mounted = null;
  win.sent.length = 0;
  const { host: bareHost } = await mountBar({
    desktop: win.host,
    bare: true,
    pathname: "/s/doc-room-1/present",
    environment: env,
    services,
  });
  expect(
    bareHost.querySelector('[data-surface="desktop-titlebar"]'),
  ).not.toBeNull();
  expect(bareHost.querySelector('[data-slot="windows-app-menu"]')).toBeNull();
  const bareClose = bareHost.querySelector<HTMLButtonElement>(
    `button[aria-label="${DESKTOP_WORDS.closeWindow}"]`,
  );
  await act(async () => {
    bareClose?.click();
  });
  expect(win.sent.at(-1)).toEqual({
    v: 1,
    t: "window_action",
    action: "close",
    windowKey: "room:doc-room-1",
  });
  expect([
    windowKeyForPath("/"),
    windowKeyForPath("/s/doc-1/present"),
    windowKeyForPath("/s/doc-2/prompter"),
  ]).toEqual([undefined, "room:doc-1", "prompter:doc-2"]);
});
