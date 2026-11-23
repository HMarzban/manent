import { withDom } from "@manent/testkit/dom";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, expect, test } from "bun:test";
import {
  COMMANDS,
  createCommandService,
  resolveBindings,
} from "@manent/commands";
import type { CommandContext, CommandService } from "@manent/commands";
import {
  SETTINGS,
  createMemoryBag,
  createSettingsStore,
} from "@manent/settings";
import type { SettingsStore } from "@manent/settings";
import {
  CommandPalette,
  CommandsProvider,
  createCommandSource,
  createSettingSource,
  createValue,
} from "../src/index.ts";
import type { PaletteRow, PaletteSource } from "../src/index.ts";

withDom();

const CTX: CommandContext = {
  screen: "document",
  focus: "page",
  docOpen: true,
  role: "editor",
  online: true,
  platform: "mac",
  shell: "web",
  demo: false,
  signedIn: true,
  workspace: "writable",
  panelOpen: { left: false, side: false },
  historyPresent: false,
  format: null,
  rulerShown: false,
  layoutView: "page",
  spaceBeforeSet: false,
  zoom: null,
  zoomPercent: null,
  docKind: null,
  projectKind: null,
  outlineStart: false,
  writing: null,
  material: null,
  rundown: null,
  prompter: null,
  inTrash: false,
  canDelete: false,
  focusMode: false,
  readingAloud: false,
  sprintRunning: false,
  production: null,
};

const SCOPE_WORDS = {
  personal: "yours",
  device: "this browser",
  script: "this script",
  project: "this project",
} as const;

const noop = (): void => {};
const bag = () => createMemoryBag({ initial: {}, writable: () => true });

interface Palette {
  store: SettingsStore;
  service: CommandService;
  sources: readonly PaletteSource[];
  closed: number[];
  /** `close` and `run <id>`, in the order the palette asked for them. */
  calls: string[];
  render: (props: {
    recent?: readonly string[];
    sources?: readonly PaletteSource[];
    filter?: "all" | "places";
  }) => Promise<void>;
}

const roots: Root[] = [];
afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

function palette(context: CommandContext = CTX): Palette {
  const store = createSettingsStore({
    registry: SETTINGS,
    bags: { personal: bag(), device: bag(), script: bag(), project: null },
    beforeWrite: noop,
    deferRemote: (apply) => apply(),
    locked: () => false,
  });
  const resolved = createValue(
    resolveBindings({
      commands: COMMANDS,
      custom: [],
      platform: "mac",
      shell: "web",
      findings: { failsHere: new Set() },
    }),
  );
  const service = createCommandService({
    commands: COMMANDS,
    handlers: Object.fromEntries(COMMANDS.map((c) => [c.id, noop])),
    context: () => context,
    settings: store,
    bindings: () => resolved.get().effective,
    onDisabled: noop,
  });
  const sources: readonly PaletteSource[] = [
    createCommandSource({
      commands: COMMANDS,
      service,
      platform: "mac",
      shell: "web",
    }),
    createSettingSource({
      commands: COMMANDS,
      service,
      settings: store,
      platform: "mac",
      shell: "web",
      scopeWords: SCOPE_WORDS,
    }),
  ];
  const closed: number[] = [];
  const calls: string[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const tree = (props: {
    recent?: readonly string[];
    sources?: readonly PaletteSource[];
    filter?: "all" | "places";
  }): ReactNode => (
    <CommandsProvider service={service} resolved={resolved} platform="mac">
      <CommandPalette
        open
        filter={props.filter ?? "all"}
        sources={props.sources ?? sources}
        recent={props.recent ?? []}
        onRun={(row: PaletteRow) => {
          calls.push(`run ${row.id}`);
          service.run(row.id, "palette");
        }}
        onClose={() => {
          calls.push("close");
          closed.push(1);
        }}
      />
    </CommandsProvider>
  );
  return {
    store,
    service,
    sources,
    closed,
    calls,
    render: async (props) => {
      await act(async () => root.render(tree(props)));
    },
  };
}

const field = (): HTMLInputElement => {
  const input = document.querySelector("input");
  if (!(input instanceof HTMLInputElement))
    throw new TypeError("the palette has no field");
  return input;
};

const VALUE = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value",
);

const type = async (text: string): Promise<void> => {
  for (const char of text) {
    const input = field();
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: char, bubbles: true }),
      );
      VALUE?.set?.call(input, input.value + char);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(
        new KeyboardEvent("keyup", { key: char, bubbles: true }),
      );
    });
  }
};

const options = (): string[] =>
  [...document.querySelectorAll('[role="option"]')].map(
    (el) => el.textContent ?? "",
  );

const labels = (): string[] =>
  [...document.querySelectorAll(".mn-group-label")].map(
    (el) => el.textContent ?? "",
  );

const optionNamed = (text: string): Element => {
  const found = [...document.querySelectorAll('[role="option"]')].find(
    (el) => el.textContent === text,
  );
  if (found === undefined) throw new TypeError(`no option reads ${text}`);
  return found;
};

const press = async (key: string): Promise<void> => {
  await act(async () => {
    field().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
};

const SCENES: PaletteSource = {
  kind: "place",
  rows: () =>
    Array.from({ length: 3000 }, (_, i) => ({
      id: `scene.${i + 1}`,
      kind: "place",
      label: `${i + 1}. INT. LIGHTHOUSE - NIGHT`,
      value: null,
      scopeWord: null,
      home: null,
      keys: null,
      checked: null,
      enabled: true,
      whyNot: null,
    })),
};

const pressEnter = async (): Promise<void> => {
  await act(async () => {
    field().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
};

test("empty, it is the last five commands and then the menus, each section labelled", async () => {
  const p = palette();
  await p.render({
    recent: [
      "app.shortcuts",
      "view.leftPanel",
      "app.goTo",
      "edit.undo",
      "app.nextRegion",
      "app.palette",
    ],
  });
  expect({ labels: labels(), options: options() }).toEqual({
    labels: ["Last used", "Menus"],
    options: [
      "Keyboard shortcutsHelp⌘/",
      "Left panelView⌘⌥1",
      "Go to⌘G",
      "UndoEdit⌘Z",
      "Next regionF6",
      "Manent",
      "File",
      "Edit",
      "View",
      "Format",
      "Script",
      "Help",
    ],
  });
});

test("with no recent command, the menus are the one section and carry no label", async () => {
  const p = palette();
  await p.render({});
  expect({ labels: labels(), first: options()[0] }).toEqual({
    labels: [],
    first: "Manent",
  });
});

test("a menu opens in place, named, its groups divided, and its rows without their home", async () => {
  const p = palette();
  await p.render({});
  await act(async () => {
    optionNamed("View").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  });
  expect({
    labels: labels(),
    list: document
      .querySelector('[role="listbox"]')
      ?.getAttribute("aria-label"),
    placeholder: field().placeholder,
    first: options().slice(0, 3),
    separators:
      document.querySelectorAll('[role="listbox"] [role="presentation"]')
        .length > 0,
  }).toEqual({
    labels: ["View"],
    list: "View",
    placeholder: "Search View",
    first: ["Left panel⌘⌥1", "Side panel⌘⌥2", "Page view, chosen"],
    separators: true,
  });
});

const openMenu = async (name: string): Promise<void> => {
  await act(async () => {
    optionNamed(name).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

test("inside a menu, typing looks only in it", async () => {
  const p = palette();
  await p.render({});
  await openMenu("View");
  await type("undo");
  expect({
    options: options(),
    status: document.querySelector('[role="status"]')?.textContent,
    labels: labels(),
  }).toEqual({
    options: [],
    status: 'Nothing in View matches "undo".',
    labels: [],
  });
});

test("Backspace in the empty field or ‹ Menus goes back from a menu to the menus", async () => {
  const p = palette();
  await p.render({});
  await openMenu("View");
  await press("Backspace");
  const afterKey = { labels: labels(), first: options()[0] };
  await openMenu("File");
  const back = [...document.querySelectorAll("button")].find(
    (el) => el.textContent === "‹ Menus",
  );
  await act(async () => {
    back?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect({
    afterKey,
    afterButton: { labels: labels(), first: options()[0] },
    focused: document.activeElement === field(),
  }).toEqual({
    afterKey: { labels: [], first: "Manent" },
    afterButton: { labels: [], first: "Manent" },
    focused: true,
  });
});

test("a query that finds nothing says so in the words of where the person looks", async () => {
  const p = palette();
  await p.render({});
  await type("zzqx");
  const all = document.querySelector('[role="status"]')?.textContent;
  await p.render({ filter: "places" });
  const places = document.querySelector('[role="status"]')?.textContent;
  expect({ all, places, options: options() }).toEqual({
    all: 'Nothing matches "zzqx".',
    places: 'No page, page label or scene matches "zzqx".',
    options: [],
  });
});

const foot = (): string =>
  document.querySelector('[aria-hidden="true"].border-t')?.textContent ?? "";

test("the foot names the keys, and what Enter does to the row the keys are on", async () => {
  const p = palette();
  await p.render({});
  const home = foot();
  await openMenu("View");
  const inMenu = foot();
  await type("theme dark");
  const setting = foot();
  expect({ home, inMenu, setting }).toEqual({
    home: "↑↓Move↵OpenEscClose",
    inMenu: "↑↓Move↵Choose⌫BackEscClose",
    setting: "↑↓Move↵Change⌫BackEscClose",
  });
});

test("the pointer over a row never moves what Enter runs", async () => {
  const p = palette();
  await p.render({});
  await act(async () => {
    optionNamed("File").dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, movementX: 4 }),
    );
  });
  expect(
    document.querySelector('[role="option"][data-highlighted]')?.textContent,
  ).toBe("Manent");
});

test("a setting row shows its value and scope, and Enter changes it in place and marks it chosen", async () => {
  const p = palette();
  await p.render({});
  await type("theme dark");
  expect(options()[0]).toBe("Theme: Dark · yoursPreferences → Appearance");
  await pressEnter();
  expect([
    p.store.get("appearance.theme"),
    p.closed,
    document.querySelector("input") !== null,
    options()[0],
    document.querySelectorAll('[role="option"] svg.lucide-check').length,
  ]).toEqual([
    "dark",
    [],
    true,
    "Theme: Dark · yours, chosenPreferences → Appearance",
    1,
  ]);
});

test("a command row runs and the palette closes", async () => {
  const p = palette();
  await p.render({});
  await type("side panel");
  await pressEnter();
  expect(p.closed).toEqual([1]);
});

test("a command row closes the palette before it runs, so the command runs from where focus was", async () => {
  const p = palette();
  await p.render({});
  await type("side panel");
  await pressEnter();
  expect(p.calls).toEqual(["close", "run view.sidePanel"]);
});

test("a command that opens the palette again from it starts afresh, with focus in the field", async () => {
  const p = palette();
  await p.render({});
  await type("commands");
  await pressEnter();
  expect([p.calls, field().value, document.activeElement === field()]).toEqual([
    ["close", "run app.palette"],
    "",
    true,
  ]);
});

test("while an input method composes, Enter in the palette runs nothing", async () => {
  const p = palette();
  await p.render({});
  await type("side panel");
  await act(async () => {
    field().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        isComposing: true,
      }),
    );
  });
  expect(p.calls).toEqual([]);
});

test("an unavailable row stays and says why", async () => {
  const p = palette({ ...CTX, screen: "library", docOpen: false });
  await p.render({});
  await type("left panel");
  const row = [...document.querySelectorAll('[role="option"]')].find((el) =>
    el.textContent?.startsWith("Left panel"),
  );
  // Enter cannot run it, so the foot does not offer Enter
  expect([
    row?.textContent,
    row?.getAttribute("aria-disabled"),
    foot(),
  ]).toEqual([
    "Left panel — needs a document openView⌘⌥1",
    "true",
    "↑↓MoveEscClose",
  ]);
  await pressEnter();
  expect(p.closed).toEqual([]);
});

test("results shown for a query never move when a slower source answers", async () => {
  const p = palette();
  let answered = false;
  const late: PaletteRow = {
    id: "page.2",
    kind: "place",
    label: "Page 2",
    value: null,
    scopeWord: null,
    home: null,
    keys: null,
    checked: null,
    enabled: true,
    whyNot: null,
  };
  const slow: PaletteSource = {
    kind: "place",
    rows: () => (answered ? [late] : []),
  };
  await p.render({ sources: [...p.sources, slow] });
  await type("pa");
  const before = options();
  answered = true;
  await p.render({ sources: [...p.sources, slow] });
  expect([
    options().slice(0, before.length),
    options().slice(before.length),
  ]).toEqual([before, ["Page 2"]]);
});

test("focus is in the field at once and every typed character arrives", async () => {
  const p = palette();
  await p.render({});
  expect(document.activeElement).toBe(field());
  await type("prefer");
  expect([field().value, options()[0]]).toEqual([
    "prefer",
    "PreferencesManent⌘,",
  ]);
});

test("more than 100 results are drawn as a window of rows", async () => {
  const p = palette();
  await p.render({ sources: [...p.sources, SCENES] });
  await type("int");
  const spacer = document.querySelector('[role="listbox"] .relative');
  // happy-dom lays nothing out, so the window holds no row; the spacer is as tall as every row together:
  // the 3,000 scenes, the four Interface size rows and the labels of their two sections, 28 px each
  expect({
    drawn: options().length,
    height: spacer instanceof HTMLElement ? spacer.style.height : null,
  }).toEqual({ drawn: 0, height: "84168px" });
});

test("the window follows the list's own scrolling, and taller rows never overlap", async () => {
  const p = palette();
  await p.render({ sources: [...p.sources, SCENES] });
  // happy-dom lays nothing out: the list is given 420 px, and each row 56 px, as at Interface size 200 %
  const client = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  );
  const rect = Element.prototype.getBoundingClientRect;
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement): number {
      return this.getAttribute("role") === "listbox" ? 420 : 0;
    },
  });
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return this.hasAttribute("data-index")
      ? new DOMRect(0, 0, 640, 56)
      : rect.call(this);
  };
  try {
    await type("int");
    const list = document.querySelector('[role="listbox"]');
    if (!(list instanceof HTMLElement)) throw new TypeError("no list");
    const starts = (): string[] =>
      [...list.querySelectorAll("[data-index]")].map((row) =>
        row instanceof HTMLElement ? row.style.transform : "",
      );
    const first = { starts: starts(), label: options()[0] };
    await act(async () => {
      list.scrollTop = 56_000;
      list.dispatchEvent(new Event("scroll"));
    });
    // rows drawn while scrolling are measured by the browser's resize observer, which happy-dom never runs
    expect({ first, scrolled: options()[0] }).toEqual({
      first: {
        starts: [
          "translateY(0px)",
          "translateY(56px)",
          "translateY(112px)",
          "translateY(168px)",
          "translateY(224px)",
          "translateY(280px)",
          "translateY(336px)",
          "translateY(392px)",
          "translateY(448px)",
        ],
        label:
          "Interface size: 100 % · this browser, chosenPreferences → This browser",
      },
      scrolled: "1978. INT. LIGHTHOUSE - NIGHT",
    });
  } finally {
    Element.prototype.getBoundingClientRect = rect;
    if (client === undefined)
      Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
    else Object.defineProperty(HTMLElement.prototype, "clientHeight", client);
  }
});
