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
  panelOpen: { left: false, side: false },
  historyPresent: false,
  production: null,
};

const SCOPE_WORDS = {
  personal: "yours",
  device: "this browser",
  script: "this script",
} as const;

const noop = (): void => {};
const bag = () => createMemoryBag({ initial: {}, writable: () => true });

interface Palette {
  store: SettingsStore;
  service: CommandService;
  sources: readonly PaletteSource[];
  closed: number[];
  render: (props: {
    recent?: readonly string[];
    sources?: readonly PaletteSource[];
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
    bags: { personal: bag(), device: bag(), script: bag() },
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
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const tree = (props: {
    recent?: readonly string[];
    sources?: readonly PaletteSource[];
  }): ReactNode => (
    <CommandsProvider service={service} resolved={resolved} platform="mac">
      <CommandPalette
        open
        filter="all"
        sources={props.sources ?? sources}
        recent={props.recent ?? []}
        onRun={(row: PaletteRow) => service.run(row.id, "palette")}
        onClose={() => closed.push(1)}
      />
    </CommandsProvider>
  );
  return {
    store,
    service,
    sources,
    closed,
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

test("empty, it is the menu and the last five commands", async () => {
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
  expect(options()).toEqual([
    "Manent",
    "File",
    "Edit",
    "View",
    "Format",
    "Help",
    "Keyboard shortcuts⌘/",
    "Left panel⌘⌥1",
    "Go to⌘G",
    "Undo⌘Z",
    "Next regionF6",
  ]);
  const view = [...document.querySelectorAll('[role="option"]')].find(
    (el) => el.textContent === "View",
  );
  await act(async () => {
    view?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(options().slice(0, 3)).toEqual([
    "Left panel⌘⌥1",
    "Side panel⌘⌥2",
    "Typewriter scrolling: Off · yoursPreferences → Writing",
  ]);
});

test("a setting row shows its value and scope, and Enter changes it in place", async () => {
  const p = palette();
  await p.render({});
  await type("theme dark");
  expect(options()[0]).toBe("Theme: Dark · yoursPreferences → Appearance");
  await pressEnter();
  expect([
    p.store.get("appearance.theme"),
    p.closed,
    document.querySelector("input") !== null,
  ]).toEqual(["dark", [], true]);
});

test("a command row runs and the palette closes", async () => {
  const p = palette();
  await p.render({});
  await type("side panel");
  await pressEnter();
  expect(p.closed).toEqual([1]);
});

test("an unavailable row stays and says why", async () => {
  const p = palette({ ...CTX, screen: "library", docOpen: false });
  await p.render({});
  await type("left panel");
  const row = [...document.querySelectorAll('[role="option"]')].find((el) =>
    el.textContent?.startsWith("Left panel"),
  );
  expect([row?.textContent, row?.getAttribute("aria-disabled")]).toEqual([
    "Left panel — needs a document open⌘⌥1",
    "true",
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
  expect([field().value, options()[0]]).toEqual(["prefer", "Preferences⌘,"]);
});

test("more than 100 results are drawn as a window of rows", async () => {
  const p = palette();
  await p.render({ sources: [...p.sources, SCENES] });
  await type("int");
  const spacer = document.querySelector('[role="listbox"] .relative');
  // happy-dom lays nothing out, so the window holds no row; the spacer is as tall as every row together:
  // the 3,000 scenes and the four Interface size rows, 28 px each
  expect({
    drawn: options().length,
    height: spacer instanceof HTMLElement ? spacer.style.height : null,
  }).toEqual({ drawn: 0, height: "84112px" });
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
        label: "Interface size: 100 % · this browserPreferences → This browser",
      },
      scrolled: "1980. INT. LIGHTHOUSE - NIGHT",
    });
  } finally {
    Element.prototype.getBoundingClientRect = rect;
    if (client === undefined)
      Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
    else Object.defineProperty(HTMLElement.prototype, "clientHeight", client);
  }
});
