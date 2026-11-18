import { withDom } from "@manent/testkit/dom";
import { Profiler, act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, expect, test } from "bun:test";
import {
  SETTINGS,
  createMemoryBag,
  createPersonalBag,
  createSettingsStore,
} from "@manent/settings";
import type { Bag, KeyValueMap, SettingsStore } from "@manent/settings";
import {
  SettingRow,
  SettingsProvider,
  applyAppearance,
  useSetting,
} from "../src/index.ts";
import type { BootWrite } from "../src/index.ts";

withDom();

type Listener = Parameters<KeyValueMap["subscribe"]>[0];

const noop = (): void => {};
const run = (fn: () => void): (() => void) => {
  fn();
  return noop;
};

const memoryMap = (): KeyValueMap => {
  const values = new Map<string, unknown>();
  const listeners = new Set<Listener>();
  return {
    get: (key) => values.get(key),
    set(key, value) {
      values.set(key, value);
      for (const listener of listeners) listener([key], "local");
    },
    keys: () => [...values.keys()],
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const memoryBag = (): Bag =>
  createMemoryBag({ initial: {}, writable: () => true });

const NOV_12 = new Date(2026, 10, 12, 10, 30).getTime();

const createStore = (
  bags: { personal?: Bag; script?: Bag } = {},
): SettingsStore =>
  createSettingsStore({
    registry: SETTINGS,
    bags: {
      personal: bags.personal ?? memoryBag(),
      device: memoryBag(),
      script: bags.script ?? memoryBag(),
    },
    beforeWrite: noop,
    deferRemote: (apply) => apply(),
    locked: () => false,
  });

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  for (const name of document.documentElement.getAttributeNames())
    if (name.startsWith("data-"))
      document.documentElement.removeAttribute(name);
});

const render = (node: ReactNode): HTMLElement => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(node));
  return host;
};

const systemPrefers = (scheme: "light" | "dark"): void => {
  const query = "(prefers-color-scheme: dark)";
  Reflect.set(window, "matchMedia", (media: string) => ({
    media,
    matches: media === query && scheme === "dark",
    addEventListener: noop,
    removeEventListener: noop,
  }));
};

const describedBy = (control: Element): string =>
  (control.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

const nameOf = (control: Element): string =>
  (control.getAttribute("aria-labelledby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

function ThemeReader(): ReactNode {
  return useSetting("appearance.theme");
}

function WhitePageReader(): ReactNode {
  return String(useSetting("appearance.whitePage"));
}

test("one setting re-renders only the components that read it", () => {
  const store = createStore();
  const commits: string[] = [];
  const onRender = (id: string): void => {
    commits.push(id);
  };
  const host = render(
    <SettingsProvider store={store}>
      <Profiler id="theme" onRender={onRender}>
        <ThemeReader />
      </Profiler>
      <Profiler id="whitePage" onRender={onRender}>
        <WhitePageReader />
      </Profiler>
    </SettingsProvider>,
  );
  commits.length = 0;
  act(() => {
    store.set("appearance.whitePage", true);
  });
  expect([commits, host.textContent]).toEqual([["whitePage"], "systemtrue"]);
});

test("appearance is attributes on the root and nothing else", () => {
  const store = createStore();
  const root = document.documentElement;
  const writes: BootWrite[][] = [];
  applyAppearance({
    store,
    root,
    frame: run,
    onBootWrites: (w) => writes.push([...w]),
  });
  store.set("appearance.theme", "dark");
  store.set("device.interfaceSize", "200");
  store.set("writing.showCursors", false);
  store.set("appearance.whitePage", true);
  expect([
    root.getAttribute("data-theme"),
    root.getAttribute("data-ui-size"),
    root.getAttribute("data-cursors"),
    root.getAttribute("data-white-page"),
  ]).toEqual(["dark", "200", "off", ""]);
  expect(root.getAttribute("style")).toBeNull();
  expect(writes.at(-1)).toEqual([
    ["a", "data-theme", "dark"],
    ["a", "data-white-page", ""],
    ["a", "data-ui-size", "200"],
  ]);
  store.set("appearance.theme", "system");
  expect(root.hasAttribute("data-theme")).toBe(false);
});

test("a theme change holds transitions off until the next frame, and stopping it leaves the root alone", () => {
  const store = createStore();
  const root = document.documentElement;
  const frames: (() => void)[] = [];
  const stop = applyAppearance({
    store,
    root,
    frame: (fn) => {
      frames.push(fn);
      return noop;
    },
    onBootWrites: noop,
  });
  store.set("appearance.theme", "dark");
  const during = root.getAttribute("data-switching");
  for (const fn of frames.splice(0)) fn();
  const after = root.hasAttribute("data-switching");
  stop();
  store.set("appearance.theme", "light");
  expect([during, after, root.getAttribute("data-theme")]).toEqual([
    "",
    false,
    "dark",
  ]);
});

test("a setting row is the one control for its preference, named by its label, with its default and who set it", () => {
  systemPrefers("dark");
  const store = createStore({
    personal: createPersonalBag({
      map: memoryMap(),
      deviceId: "device-a",
      deviceName: "Chrome on macOS",
      now: () => NOV_12,
    }),
  });
  const host = render(
    <SettingsProvider store={store}>
      <SettingRow
        settingKey="writing.typewriterScrolling"
        deviceName="Chrome on macOS"
        persisted
      />
      <SettingRow
        settingKey="appearance.theme"
        deviceName="Chrome on macOS"
        persisted
      />
      <SettingRow
        settingKey="writing.enterAfterDialogue"
        deviceName="Chrome on macOS"
        persisted
      />
    </SettingsProvider>,
  );
  const switches = host.querySelectorAll('[role="switch"]');
  const groups = host.querySelectorAll('[role="radiogroup"]');
  const theme = groups[0];
  const enter = groups[1];
  if (switches.length !== 1 || theme === undefined || enter === undefined)
    throw new TypeError("the rows drew the wrong controls");
  expect([
    nameOf(switches[0]!),
    describedBy(switches[0]!),
    nameOf(theme),
    [...theme.querySelectorAll('[role="radio"]')].map(nameOf),
  ]).toEqual([
    "Typewriter scrolling",
    "Keeps the line you are writing at the same height in the window. Default: Off",
    "Theme",
    ["System (now Dark)", "Light", "Dark"],
  ]);
  act(() => {
    store.set("writing.enterAfterDialogue", "character");
  });
  const reset = [...host.querySelectorAll("button")].find(
    (b) => b.textContent === "Reset",
  );
  expect([describedBy(enter), reset === undefined]).toEqual([
    "Set by you 12 Nov · Default: Action",
    false,
  ]);
  act(() => reset?.click());
  expect([
    store.get("writing.enterAfterDialogue"),
    describedBy(enter),
    [...host.querySelectorAll("button")].some((b) => b.textContent === "Reset"),
  ]).toEqual(["action", "Default: Action", false]);
});

test("a preference set on another device names that device", () => {
  const map = memoryMap();
  createPersonalBag({
    map,
    deviceId: "device-b",
    deviceName: "Firefox on Linux",
    now: () => NOV_12,
  }).write({ "appearance.theme": "dark" });
  const store = createStore({
    personal: createPersonalBag({
      map,
      deviceId: "device-a",
      deviceName: "Chrome on macOS",
      now: () => NOV_12,
    }),
  });
  const host = render(
    <SettingsProvider store={store}>
      <SettingRow
        settingKey="appearance.theme"
        deviceName="Chrome on macOS"
        persisted
      />
    </SettingsProvider>,
  );
  const group = host.querySelector('[role="radiogroup"]');
  if (group === null) throw new TypeError("no radio group");
  expect(describedBy(group)).toBe(
    "Set by you 12 Nov · Default: System, from Firefox on Linux",
  );
});

test("a script setting someone else set is never said to be set by you", () => {
  const received = createMemoryBag({ initial: {}, writable: () => true });
  received.receive({ "script.paper": "a4" }, "sam");
  // a script's bag knows when a value arrived; the memory bag does not, so the date is added here
  const script: Bag = {
    ...received,
    provenance(key) {
      const provenance = received.provenance(key);
      return provenance === null ? null : { ...provenance, at: NOV_12 };
    },
  };
  const store = createStore({ script });
  const host = render(
    <SettingsProvider store={store}>
      <SettingRow
        settingKey="script.paper"
        deviceName="Chrome on macOS"
        persisted
      />
    </SettingsProvider>,
  );
  const group = host.querySelector('[role="radiogroup"]');
  if (group === null) throw new TypeError("no radio group");
  expect([store.explain("script.paper").modified, describedBy(group)]).toEqual([
    true,
    "Default: US Letter",
  ]);
});

test("a row on a device that cannot save says so", () => {
  systemPrefers("light");
  const host = render(
    <SettingsProvider store={createStore()}>
      <SettingRow
        settingKey="appearance.theme"
        deviceName={null}
        persisted={false}
      />
    </SettingsProvider>,
  );
  const radios = [...host.querySelectorAll('[role="radio"]')].map(nameOf);
  expect([
    radios[0],
    host.textContent?.includes("Not saved on this device"),
  ]).toEqual(["System (now Light)", true]);
});

test("Interface size is a segmented control, and a long choice list a select", () => {
  const host = render(
    <SettingsProvider store={createStore()}>
      <SettingRow
        settingKey="device.interfaceSize"
        deviceName={null}
        persisted
      />
      <SettingRow settingKey="script.format" deviceName={null} persisted />
    </SettingsProvider>,
  );
  expect([
    [...host.querySelectorAll("[aria-pressed]")].map((b) => b.textContent),
    host.querySelectorAll('[role="combobox"]').length,
    host.querySelectorAll('[role="radiogroup"]').length,
  ]).toEqual([["100 %", "125 %", "150 %", "200 %"], 1, 0]);
});
