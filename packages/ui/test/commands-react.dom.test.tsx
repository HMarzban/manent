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
import type {
  CommandContext,
  CommandService,
  Resolved,
  SettingWriter,
} from "@manent/commands";
import type { Platform } from "@manent/settings";
import {
  CommandButton,
  CommandMenu,
  CommandsProvider,
  GlobalKeys,
  createValue,
} from "../src/index.ts";

withDom();

const CTX: CommandContext = {
  screen: "document",
  focus: "page",
  docOpen: true,
  role: "editor",
  online: true,
  platform: "windows",
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

const memorySettings = (initial: Record<string, unknown>): SettingWriter => {
  const values = new Map(Object.entries(initial));
  return {
    get: (key) => values.get(key),
    set: (key, value) => {
      values.set(key, value);
      return { ok: true };
    },
  };
};

const resolvedFor = (platform: Platform): Resolved =>
  resolveBindings({
    commands: COMMANDS,
    custom: [],
    platform,
    shell: "web",
    findings: { failsHere: new Set() },
  });

interface Setup {
  service: CommandService;
  /** What the app calls when the context or the bindings changed. */
  notify: () => void;
  runs: string[];
  disabled: [string, string][];
  ran: string[];
}

function setup(options: {
  platform: Platform;
  context: () => CommandContext;
  settings?: SettingWriter;
}): Setup & { tree: (children: ReactNode) => ReactNode } {
  const resolved = createValue(resolvedFor(options.platform));
  const ran: string[] = [];
  const disabled: [string, string][] = [];
  const handlers = Object.fromEntries(
    COMMANDS.map((c) => [c.id, () => ran.push(c.id)]),
  );
  const inner = createCommandService({
    commands: COMMANDS,
    handlers,
    context: options.context,
    settings: options.settings ?? memorySettings({}),
    bindings: () => resolved.get().effective,
    onDisabled: (label, reason) => disabled.push([label, reason]),
  });
  const runs: string[] = [];
  const service: CommandService = {
    run: (id, source) => {
      runs.push(id);
      return inner.run(id, source);
    },
    state: (id) => inner.state(id),
    subscribe: (listener) => inner.subscribe(listener),
  };
  return {
    service,
    notify: () => inner.notify(),
    runs,
    disabled,
    ran,
    tree: (children) => (
      <CommandsProvider
        service={service}
        resolved={resolved}
        platform={options.platform}
      >
        {children}
      </CommandsProvider>
    ),
  };
}

const describedBy = (el: Element): string =>
  document.getElementById(el.getAttribute("aria-describedby") ?? "")
    ?.textContent ?? "";

const roots: Root[] = [];
afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

const render = async (node: ReactNode): Promise<HTMLElement> => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
};

const press = (target: Element, init: KeyboardEventInit): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

test("one press runs one command, and its default is prevented unless it passed", async () => {
  let focus: CommandContext["focus"] = "page";
  const { service, runs, ran, tree } = setup({
    platform: "windows",
    context: () => ({ ...CTX, focus }),
  });
  const host = await render(tree(<GlobalKeys />));
  const editable = document.createElement("div");
  editable.contentEditable = "true";
  const input = document.createElement("input");
  host.append(editable, input);
  const modK = { key: "k", code: "KeyK", ctrlKey: true };
  const prevented = [editable, input, document.body].map((target) => {
    if (target instanceof HTMLElement) target.focus();
    return press(target, modK).defaultPrevented;
  });
  expect([prevented, runs, ran]).toEqual([
    [true, true, true],
    ["app.palette", "app.palette", "app.palette"],
    ["app.palette", "app.palette", "app.palette"],
  ]);
  focus = "field";
  input.focus();
  const undo = press(input, { key: "z", code: "KeyZ", ctrlKey: true });
  expect([
    undo.defaultPrevented,
    runs.at(-1),
    service.run("edit.undo", "key"),
  ]).toEqual([false, "edit.undo", "passed"]);
});

test("F6 and Shift+F6 move between regions from a field and from the page, as from anywhere", async () => {
  const { runs, tree } = setup({ platform: "windows", context: () => CTX });
  const host = await render(tree(<GlobalKeys />));
  const editable = document.createElement("div");
  editable.contentEditable = "true";
  const input = document.createElement("input");
  host.append(editable, input);
  const prevented = [input, editable].flatMap((target) => {
    target.focus();
    return [
      press(target, { key: "F6", code: "F6" }).defaultPrevented,
      press(target, { key: "F6", code: "F6", shiftKey: true }).defaultPrevented,
    ];
  });
  expect([prevented, runs]).toEqual([
    [true, true, true, true],
    [
      "app.nextRegion",
      "app.previousRegion",
      "app.nextRegion",
      "app.previousRegion",
    ],
  ]);
});

test("nothing runs while an input method is composing", async () => {
  const { runs, tree } = setup({ platform: "windows", context: () => CTX });
  await render(tree(<GlobalKeys />));
  const event = press(document.body, {
    key: "k",
    code: "KeyK",
    ctrlKey: true,
    isComposing: true,
  });
  expect([runs, event.defaultPrevented]).toEqual([[], false]);
});

test("a disabled press is answered in words", async () => {
  const { disabled, ran, tree } = setup({
    platform: "mac",
    context: () => ({
      ...CTX,
      screen: "library",
      docOpen: false,
      platform: "mac",
    }),
  });
  await render(tree(<GlobalKeys />));
  const event = press(document.body, {
    key: "¡",
    code: "Digit1",
    keyCode: 49,
    metaKey: true,
    altKey: true,
  });
  expect([disabled, ran, event.defaultPrevented]).toEqual([
    [["Left panel", "needs a document open"]],
    [],
    true,
  ]);
});

test("a command button takes its words from the registry and stays focusable when disabled", async () => {
  let docOpen = true;
  const { notify, runs, tree } = setup({
    platform: "mac",
    context: () => ({ ...CTX, docOpen, platform: "mac" }),
  });
  const host = await render(
    tree(
      <>
        <CommandButton id="app.palette" />
        <CommandButton id="view.leftPanel" variant="outline" size="sm" />
      </>,
    ),
  );
  const [palette, left] = [...host.querySelectorAll("button")];
  if (palette === undefined || left === undefined)
    throw new TypeError("the buttons were not drawn");
  expect([
    palette.textContent,
    palette.getAttribute("data-tour"),
    palette.getAttribute("aria-disabled"),
    left.getAttribute("data-tour"),
  ]).toEqual(["Commands", "app.palette", null, "view.leftPanel"]);
  docOpen = false;
  await act(async () => notify());
  act(() => left.focus());
  await act(async () => left.click());
  expect([
    left.getAttribute("aria-disabled"),
    left.textContent,
    document.activeElement === left,
    describedBy(left),
    runs,
  ]).toEqual([
    "true",
    "Left panel",
    true,
    "Left panel — needs a document open",
    ["view.leftPanel"],
  ]);
  await act(async () => {
    palette.focus();
  });
  expect(document.body.textContent).toContain("Commands⌘K");
});

test("a command button that a popup focuses as it opens shows no tooltip, and one focused from inside it does", async () => {
  const { tree } = setup({
    platform: "mac",
    context: () => ({ ...CTX, platform: "mac" }),
  });
  const host = await render(
    tree(
      <>
        <button type="button">Back</button>
        <div role="dialog">
          <button type="button">Inside</button>
          <CommandButton id="app.palette" />
        </div>
      </>,
    ),
  );
  const [outside, inside, command] = [...host.querySelectorAll("button")];
  if (outside === undefined || inside === undefined || command === undefined)
    throw new TypeError("the buttons were not drawn");
  const shown = async (from: HTMLElement): Promise<string | null> => {
    await act(async () => from.focus());
    await act(async () => command.focus());
    return document.body.textContent;
  };
  expect([await shown(outside), await shown(inside)]).toEqual([
    "BackInsideCommands",
    "BackInsideCommandsCommands⌘K",
  ]);
});

test("a menu is generated from the registry, with marks and keys", async () => {
  const { tree } = setup({
    platform: "mac",
    context: () => ({ ...CTX, platform: "mac" }),
    settings: memorySettings({ "appearance.theme": "dark" }),
  });
  const host = await render(
    tree(<CommandMenu menu="view" trigger="View" label="View" />),
  );
  const trigger = host.querySelector("button");
  await act(async () => trigger?.click());
  const items = [
    ...document.querySelectorAll(
      '[role="menuitem"], [role="menuitemcheckbox"]',
    ),
  ].map((el) => el.textContent);
  expect(items.slice(0, 2)).toEqual(["Left panel⌘⌥1", "Side panel⌘⌥2"]);
  const theme = [...document.querySelectorAll('[role="menuitem"]')].find(
    (el) => el.textContent === "Theme",
  );
  await act(async () => {
    theme?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const dark = [
    ...document.querySelectorAll(
      '[role="menuitemradio"], [role="menuitemcheckbox"]',
    ),
  ].find((el) => el.textContent === "Dark");
  expect([theme === undefined, dark?.getAttribute("aria-checked")]).toEqual([
    false,
    "true",
  ]);
});
