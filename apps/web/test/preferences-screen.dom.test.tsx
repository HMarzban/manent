import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { SECTION_IDS, entryKey } from "@manent/settings";
import type { SectionId } from "@manent/settings";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { PreferencesScreen } from "../src/screens/preferences/preferences-screen.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { FixedKey, PersonServices } from "../src/services/ports.ts";
import { AppShell, ScreenArea } from "../src/shell/app-shell.tsx";
import { createShellDom } from "../src/shell/regions.tsx";
import { bindGuard } from "../src/state/guard.ts";
import {
  MemoryStorage,
  RefusingStorage,
  createClock,
  createNavigation,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

const NOV_12 = new Date(2026, 10, 12, 10, 30).getTime();
const LEO = "leo";
const noop = (): void => {};

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  document.body.replaceChildren();
  Reflect.deleteProperty(navigator, "storage");
});

/** A system that prefers nothing: no dark scheme, no reduced motion, no more contrast, no forced colours. */
const systemPrefersNothing = (): void => {
  Reflect.set(window, "matchMedia", (media: string) => ({
    media,
    matches: false,
    addEventListener: noop,
    removeEventListener: noop,
  }));
};

/** A custom shortcut entry, as the keys map keeps it, set on this device. */
const shortcut = (keys: readonly string[]) => ({
  v: keys,
  at: NOV_12,
  on: "Chrome on macOS",
  unset: false,
});

async function renderPreferences(options: {
  pane: SectionId;
  storage?: Storage;
  fixedKeys?: readonly FixedKey[];
  shortcuts?: Readonly<Record<string, readonly string[]>>;
}): Promise<{
  container: HTMLElement;
  router: AnyRouter;
  services: PersonServices;
  advance(ms: number): void;
}> {
  systemPrefersNothing();
  const clock = createClock(NOV_12);
  const storage = options.storage ?? new MemoryStorage();
  if (options.shortcuts !== undefined && !(storage instanceof RefusingStorage))
    storage.setItem(
      `manent.keys.${LEO}`,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(options.shortcuts).map(([id, keys]) => [
            entryKey(id, "another-device"),
            shortcut(keys),
          ]),
        ),
      ),
    );
  const environment = testEnvironment({
    dom: createShellDom(document),
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => clock.schedule(fn, 16),
    storage,
  });
  bindGuard(environment.guard);
  const href = `/preferences/${options.pane}?from=%2F`;
  const built = testServices({
    userId: LEO,
    environment,
    router: createNavigation({
      routeId: "/preferences/$pane",
      href,
      search: { from: "/" },
    }).navigation,
  });
  const services: PersonServices = {
    ...built,
    fixedKeys: options.fixedKeys ?? [],
  };
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
      path: "/",
      component: () => <h1 tabIndex={-1}>Library</h1>,
    }),
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
    history: createMemoryHistory({ initialEntries: [href] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  await act(async () =>
    mounted?.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <RouterProvider router={router} />
        </ServicesProvider>
      </EnvironmentProvider>,
    ),
  );
  return {
    container,
    router,
    services,
    advance: (ms) => act(() => clock.advance(ms)),
  };
}

const nameOf = (element: Element): string =>
  element.getAttribute("aria-label") ??
  (element.getAttribute("aria-labelledby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

const describedBy = (element: Element): string =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");

const CONTROLS = '[role="switch"], [role="radiogroup"], [role="group"]';

/** The pane shown: its heading, its scope line and the names of its controls. */
function paneOf(container: HTMLElement): {
  heading: string;
  scope: string;
  controls: string[];
} {
  const pane = container.querySelector("section[aria-labelledby]");
  if (pane === null) throw new Error("no pane is shown");
  return {
    heading: pane.querySelector("h2")?.textContent ?? "",
    scope: pane.querySelector("h2 + p")?.textContent ?? "",
    controls: [...pane.querySelectorAll(CONTROLS)].map(nameOf),
  };
}

const buttonsNamed = (root: ParentNode, name: string): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>("button")].filter(
    (b) => b.textContent === name,
  );

function button(root: ParentNode, name: string): HTMLElement {
  const [found] = buttonsNamed(root, name);
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
}

const texts = (root: ParentNode, text: string): Element[] =>
  [...root.querySelectorAll("p, span, h2, h3, div")].filter(
    (e) => e.textContent === text && e.children.length === 0,
  );

/** The control named `name` in the pane shown. */
function control(container: HTMLElement, name: string): HTMLElement {
  const found = [...container.querySelectorAll<HTMLElement>(CONTROLS)].find(
    (c) => nameOf(c) === name,
  );
  if (found === undefined) throw new Error(`no control named ${name}`);
  return found;
}

const radio = (group: Element, label: string): HTMLElement => {
  const found = [...group.querySelectorAll<HTMLElement>('[role="radio"]')].find(
    (r) => nameOf(r) === label,
  );
  if (found === undefined) throw new Error(`no radio ${label}`);
  return found;
};

/** The Keyboard row of the command labelled `label`. */
function shortcutRow(container: HTMLElement, label: string): HTMLElement {
  const found = [...container.querySelectorAll<HTMLElement>("li")].find(
    (li) => li.querySelector(".mn-row .truncate")?.textContent === label,
  );
  if (found === undefined) throw new Error(`no shortcut row ${label}`);
  return found;
}

const keysOf = (row: HTMLElement): string =>
  row.querySelector("[data-trailing]")?.textContent ?? "";

const press = (
  target: EventTarget,
  init: KeyboardEventInit & { key: string },
): void => {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, ...init }),
    );
  });
};

const pressUndo = (): void =>
  press(document.body, { key: "z", code: "KeyZ", metaKey: true });

/** Types `text` into the focused `input` as one change; React reads a change in this DOM on the key's release. */
function typeInto(input: HTMLInputElement, text: string): void {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setValue?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });
}

const searchField = (container: HTMLElement): HTMLInputElement => {
  const found = container.querySelector<HTMLInputElement>(
    'input[type="search"]',
  );
  if (found === null) throw new Error("no search field");
  return found;
};

const YOURS = "Yours. These follow you to every device and affect no one else.";

test("every preference has one control named by its label, and its scope line", async () => {
  const { container, router } = await renderPreferences({ pane: "writing" });
  const panes: Record<string, ReturnType<typeof paneOf>> = {};
  for (const pane of SECTION_IDS) {
    await act(() => router.navigate({ href: `/preferences/${pane}?from=%2F` }));
    panes[pane] = paneOf(container);
  }
  expect(panes).toEqual({
    writing: {
      heading: "Writing",
      scope: YOURS,
      controls: [
        "After Dialogue, Enter starts",
        "Typewriter scrolling",
        "Check spelling as I type",
        "Show other people's cursors",
        "Announce while writing",
      ],
    },
    appearance: {
      heading: "Appearance",
      scope: YOURS,
      controls: ["Theme", "White page in dark theme"],
    },
    keyboard: {
      heading: "Keyboard",
      scope:
        "Yours. These follow you to every device and affect no one else. ⌘ is Ctrl on Windows and Linux.",
      controls: ["Shortcuts"],
    },
    account: { heading: "Account", scope: YOURS, controls: [] },
    device: {
      heading: "This browser",
      scope: "Kept in this browser only — Chrome on macOS.",
      controls: ["Interface size"],
    },
  });
  expect(document.activeElement).toBe(searchField(container));
});

test("a change applies at once and shows Set by you with its default and Reset", async () => {
  const { container, services } = await renderPreferences({ pane: "writing" });
  const enter = control(container, "After Dialogue, Enter starts");
  expect([describedBy(enter), buttonsNamed(container, "Reset")]).toEqual([
    "Default: Action",
    [],
  ]);
  act(() => radio(enter, "Character").click());
  expect([
    services.settings.get("writing.enterAfterDialogue"),
    describedBy(enter),
    buttonsNamed(container, "Reset").length,
    buttonsNamed(container, "Set by you · 1").length,
  ]).toEqual(["character", "Set by you 12 Nov · Default: Action", 1, 1]);
  act(() => button(container, "Reset").click());
  expect([
    services.settings.get("writing.enterAfterDialogue"),
    describedBy(enter),
    buttonsNamed(container, "Set by you · 1").length,
  ]).toEqual(["action", "Default: Action", 0]);
});

test("Reset all preferences offers Undo for 30 seconds", async () => {
  const { container, services, advance } = await renderPreferences({
    pane: "writing",
  });
  act(() => {
    services.settings.set("appearance.theme", "dark");
    services.settings.set("device.interfaceSize", "150");
  });
  act(() => button(container, "Set by you · 2").click());
  act(() => button(container, "Reset all preferences").click());
  const slot = container.querySelector('[role="status"][aria-live="polite"]');
  if (slot === null) throw new Error("no message slot");
  expect([
    services.settings.get("appearance.theme"),
    services.settings.get("device.interfaceSize"),
    slot.querySelector("p")?.textContent,
    buttonsNamed(slot, "Undo").length,
    texts(container, "Everything is at its default.").length,
  ]).toEqual(["system", "100", "2 preferences reset.", 1, 1]);
  advance(29_999);
  act(() => button(slot, "Undo").click());
  expect([
    services.settings.get("appearance.theme"),
    services.settings.get("device.interfaceSize"),
    slot.textContent,
  ]).toEqual(["dark", "150", ""]);
  act(() => button(container, "Reset all preferences").click());
  advance(30_000);
  expect([slot.textContent, services.settings.get("appearance.theme")]).toEqual(
    ["", "system"],
  );
});

test("Cmd+Z on the screen undoes the last change of this visit", async () => {
  const { container, services } = await renderPreferences({
    pane: "appearance",
  });
  const theme = control(container, "Theme");
  act(() => radio(theme, "Dark").click());
  act(() => control(container, "White page in dark theme").click());
  // outside a text field
  act(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  });
  pressUndo();
  const afterOne = [
    services.settings.get("appearance.theme"),
    services.settings.get("appearance.whitePage"),
  ];
  pressUndo();
  const afterTwo = services.settings.get("appearance.theme");
  act(() => {
    services.settings.set("writing.checkSpelling", false);
  });
  act(() => button(container, "Set by you · 1").click());
  act(() => button(container, "Reset all preferences").click());
  const afterReset = services.settings.get("writing.checkSpelling");
  pressUndo();
  expect([
    afterOne,
    afterTwo,
    afterReset,
    services.settings.get("writing.checkSpelling"),
  ]).toEqual([["dark", false], "system", true, false]);
});

test("a refusing device shows Not saved on this device", async () => {
  const { container, services } = await renderPreferences({
    pane: "writing",
    storage: new RefusingStorage(),
  });
  act(() =>
    radio(
      control(container, "Announce while writing"),
      "Element changes",
    ).click(),
  );
  expect([
    services.persisted,
    texts(container, "Not saved on this device").length,
    services.settings.get("writing.announce"),
  ]).toEqual([false, 5, "elements"]);
});

test("a clash asks before anything changes, and the loser shows No shortcut", async () => {
  const { container, services } = await renderPreferences({ pane: "keyboard" });
  act(() =>
    shortcutRow(container, "Next region")
      .querySelector<HTMLElement>(".mn-row")
      ?.click(),
  );
  const field = document.activeElement;
  if (field === null) throw new Error("the capture field took no focus");
  expect(
    texts(container, "Press the new shortcut. Esc cancels, Delete removes it.")
      .length,
  ).toBe(1);
  press(field, { key: "k", code: "KeyK", metaKey: true });
  expect([
    texts(container, "⌘K is Commands.").length,
    buttonsNamed(container, "Use it for Next region").length,
    buttonsNamed(container, "Keep Commands").length,
    keysOf(shortcutRow(container, "Commands")),
    services.keys.keys(),
  ]).toEqual([1, 1, 1, "⌘K", []]);
  act(() => button(container, "Use it for Next region").click());
  expect([
    keysOf(shortcutRow(container, "Next region")),
    keysOf(shortcutRow(container, "Commands")),
    texts(container, "⌘K is Commands.").length,
  ]).toEqual(["⌘K", "No shortcut", 0]);
});

test("a key that would leave the script is refused on the web", async () => {
  const { container, services } = await renderPreferences({ pane: "keyboard" });
  act(() =>
    shortcutRow(container, "Go to")
      .querySelector<HTMLElement>(".mn-row")
      ?.click(),
  );
  const field = document.activeElement;
  if (field === null) throw new Error("the capture field took no focus");
  press(field, { key: "w", code: "KeyW", metaKey: true });
  expect([
    texts(
      container,
      "⌘W usually closes this tab in the browser. Not offered on the web, because a missed key would leave your script.",
    ).length,
    services.keys.keys(),
    keysOf(shortcutRow(container, "Go to")),
  ]).toEqual([1, [], "⌘G"]);
});

test("fixed rows say why, and a VoiceOver chord carries its note", async () => {
  const { container } = await renderPreferences({
    pane: "keyboard",
    fixedKeys: [{ chord: "Tab", reason: "flow" }],
    shortcuts: { "app.goTo": ["Control+Alt+G"] },
  });
  const tab = [...container.querySelectorAll("li")].find(
    (li) => li.querySelector(".mn-row .truncate")?.textContent === "Tab",
  );
  expect([
    shortcutRow(container, "Undo").textContent?.includes(
      "Fixed. Copy, cut, paste and undo use your system's keys.",
    ),
    tab?.textContent?.includes(
      "Fixed. The Enter and Tab flow is the same for everyone.",
    ),
    texts(
      shortcutRow(container, "Go to"),
      "VoiceOver uses Control-Option for its own commands, so this may not reach Manent while VoiceOver is on.",
    ).length,
    texts(
      shortcutRow(container, "Commands"),
      "VoiceOver uses Control-Option for its own commands, so this may not reach Manent while VoiceOver is on.",
    ).length,
  ]).toEqual([true, true, 1, 0]);
});

test("a shortcut that may not work here says so and gives the way that always works", async () => {
  const { container } = await renderPreferences({
    pane: "keyboard",
    shortcuts: { "app.nextRegion": ["Mod+T"] },
  });
  const rows = [...container.querySelectorAll<HTMLElement>("li")];
  const row = shortcutRow(container, "Next region");
  expect([
    texts(
      row,
      "May not work here: ⌘T usually opens a new tab in this browser. ⌘K, then its name, always works.",
    ).length,
    keysOf(row),
    // rows set by you and rows that may not work here come first in their group
    rows.indexOf(row) < rows.indexOf(shortcutRow(container, "Go to")),
  ]).toEqual([1, "⌘T", true]);
});

test("This browser shows what comes from the system, what is stored here, and About", async () => {
  Reflect.set(navigator, "storage", {
    persisted: async () => true,
    persist: async () => true,
  });
  Reflect.set(globalThis, "MANENT_VERSION", "1.0.0");
  const { container } = await renderPreferences({ pane: "device" });
  await act(async () => {});
  const pledge = button(container, "Read the AI pledge");
  const full =
    "Manent has no features that write for you: it generates no scenes, lines, summaries or suggestions. Your scripts are never used to train AI, by Manent or by anyone Manent works with.";
  const before = [
    pledge.getAttribute("aria-expanded"),
    texts(container, full).length,
  ];
  act(() => pledge.click());
  const open = [
    pledge.getAttribute("aria-expanded"),
    texts(container, full).length,
  ];
  act(() => pledge.click());
  expect({
    system: [
      "Motion",
      "Full",
      "Contrast",
      "Standard",
      "Change these in your system.",
    ].map((t) => texts(container, t).length),
    stored: [
      texts(
        container,
        "Kept in this browser. The browser has agreed to keep it.",
      ).length,
      buttonsNamed(container, "Ask the browser to keep it").length,
    ],
    about: [
      "Manent 1.0.0",
      "Manent sends no usage data.",
      "Manent has no features that write for you, and your scripts are never used to train AI.",
    ].map((t) => texts(container, t).length),
    pledge: [
      before,
      open,
      [pledge.getAttribute("aria-expanded"), texts(container, full).length],
    ],
  }).toEqual({
    system: [1, 1, 1, 1, 1],
    stored: [1, 0],
    about: [1, 1, 1],
    pledge: [
      ["false", 0],
      ["true", 1],
      ["false", 0],
    ],
  });
  Reflect.deleteProperty(globalThis, "MANENT_VERSION");
});

test("Escape clears the search and does not leave the screen", async () => {
  const { container, router } = await renderPreferences({ pane: "writing" });
  const search = searchField(container);
  typeInto(search, "dark");
  // the results replace the pane
  const found = [
    texts(container, "2 preferences").length,
    container.querySelector("section[aria-labelledby]"),
  ];
  press(search, { key: "Escape" });
  const cleared = [search.value, paneOf(container).heading];
  press(search, { key: "Escape" });
  expect([
    found,
    cleared,
    router.state.location.pathname,
    document.activeElement,
  ]).toEqual([[1, null], ["", "Writing"], "/preferences/writing", search]);
});
