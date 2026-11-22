import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { SettingsProvider, TimingProvider, createValue } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { desktopDeviceRows } from "../src/desktop/device-rows.ts";
import type { DesktopHost } from "../src/desktop/host.ts";
import { answerShell } from "../src/desktop/shell-channel.ts";
import { DevicePane } from "../src/screens/preferences/device-pane.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { INITIAL_SHELL_STATE } from "../src/services/ports.ts";
import type { ShellState } from "../src/services/ports.ts";
import { DATA_DIR, fakeHost } from "./desktop.fixtures.ts";
import type { FakeHost } from "./desktop.fixtures.ts";
import {
  QUIET_DOM,
  createClock,
  createNavigation,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

const noop = (): void => {};
let mounted: Root | null = null;
let stopAnswering = noop;
afterEach(() => {
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
}): Promise<{
  container: HTMLElement;
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
  const clock = createClock(0);
  const { host } = options;
  const environment = testEnvironment({
    where: {
      platform: "mac",
      shell: host === null ? "web" : "desktop",
      browser: "Chrome",
      system: "macOS",
    },
    desktop: host,
    now: clock.now,
    schedule: clock.schedule,
    dom: { ...QUIET_DOM, announce: (text) => options.announced?.push(text) },
    shellState: createValue<ShellState>({
      ...INITIAL_SHELL_STATE,
      screen: "preferences",
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
  ).toEqual([0, 0]);
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
