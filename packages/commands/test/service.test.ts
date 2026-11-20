import { expect, test } from "bun:test";
import { createCommandService } from "../src/index.ts";
import type {
  CommandContext,
  CommandDefinition,
  Keys,
  SettingWriter,
} from "../src/index.ts";

const command = (
  id: string,
  over: Partial<CommandDefinition> = {},
): CommandDefinition => ({
  id,
  label: "Go",
  group: "view",
  home: null,
  scope: "global",
  keys: { mac: [], windows: [], linux: [] },
  keysFixed: false,
  when: null,
  whyNot: null,
  visible: null,
  checked: null,
  passThrough: null,
  menus: [],
  palette: { keywords: [] },
  opens: null,
  reach: "self",
  setting: null,
  ...over,
});

const ctx =
  (over: Partial<CommandContext> = {}): (() => CommandContext) =>
  () => ({
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
    format: null,
    rulerShown: false,
    spaceBeforeSet: false,
    production: null,
    ...over,
  });

const memorySettings = (
  initial: Record<string, unknown>,
): SettingWriter & { writes: [string, unknown][] } => {
  const values = new Map(Object.entries(initial));
  const writes: [string, unknown][] = [];
  return {
    writes,
    get: (key) => values.get(key),
    set: (key, value) => {
      writes.push([key, value]);
      values.set(key, value);
      return { ok: true };
    },
  };
};

const FIXTURE: readonly CommandDefinition[] = [
  command("test.go", {
    when: (c) => c.docOpen,
    whyNot: () => "needs a document open",
  }),
  command("test.undo", {
    label: "Undo",
    passThrough: (c) => c.focus === "field",
  }),
  command("test.demo", {
    label: "Demo",
    visible: (c) => c.demo,
  }),
  command("setting.writing.typewriterScrolling", {
    label: "Typewriter scrolling: turn on",
    checked: (_, read) => read.get("writing.typewriterScrolling") === true,
    setting: { key: "writing.typewriterScrolling", value: null },
  }),
  command("setting.appearance.theme.dark", {
    label: "Theme: Dark",
    checked: (_, read) => read.get("appearance.theme") === "dark",
    setting: { key: "appearance.theme", value: "dark" },
  }),
];

const service = (
  over: Partial<Parameters<typeof createCommandService>[0]> = {},
) =>
  createCommandService({
    commands: FIXTURE,
    handlers: {},
    context: ctx(),
    settings: memorySettings({}),
    bindings: () => new Map(),
    onDisabled: () => {},
    ...over,
  });

test("run answers absent, passed, disabled or ran, and says why in words", () => {
  const said: string[][] = [];
  const ran: string[] = [];
  const handlers = {
    "test.go": () => ran.push("go"),
    "test.undo": () => ran.push("undo"),
    "test.demo": () => ran.push("demo"),
  };
  const onDisabled = (label: string, reason: string) =>
    said.push([label, reason]);
  const s = service({ handlers, onDisabled, context: ctx({ docOpen: false }) });
  expect([
    s.run("test.nope" as never, "key"),
    s.run("test.go", "key"),
    s.run("test.demo", "palette"),
  ]).toEqual(["absent", "disabled", "absent"]);
  expect(said).toEqual([["Go", "needs a document open"]]);
  expect(ran).toEqual([]);

  expect(service({ handlers, onDisabled }).run("test.go", "menu")).toBe("ran");
  expect(ran).toEqual(["go"]);

  const field = service({
    handlers,
    onDisabled,
    context: ctx({ focus: "field" }),
  });
  expect([field.run("test.undo", "key"), field.run("test.go", "key")]).toEqual([
    "passed",
    "ran",
  ]);
  expect(ran).toEqual(["go", "go"]);

  const dialog = service({
    handlers,
    onDisabled,
    context: ctx({ focus: "dialog", docOpen: false, demo: true }),
  });
  expect(
    ["test.go", "test.undo", "test.demo", "setting.appearance.theme.dark"].map(
      (id) => dialog.run(id, "key"),
    ),
  ).toEqual(["passed", "passed", "passed", "passed"]);
  expect([ran, said.length]).toEqual([["go", "go"], 1]);
});

test("a setting command sets its value, and a switch turns over", () => {
  const settings = memorySettings({
    "writing.typewriterScrolling": false,
    "appearance.theme": "system",
  });
  const s = service({ settings });
  expect([
    s.run("setting.writing.typewriterScrolling", "palette"),
    s.run("setting.writing.typewriterScrolling", "menu"),
    s.run("setting.appearance.theme.dark", "menu"),
  ]).toEqual(["ran", "ran", "ran"]);
  expect(settings.writes).toEqual([
    ["writing.typewriterScrolling", true],
    ["writing.typewriterScrolling", false],
    ["appearance.theme", "dark"],
  ]);
});

test("a command's state is read from the context, the settings and the bindings when it is asked for", () => {
  let current = ctx({ docOpen: false });
  let bindings: ReadonlyMap<string, Keys> = new Map([["test.go", ["Mod+G"]]]);
  const settings = memorySettings({ "appearance.theme": "dark" });
  const s = service({
    context: () => current(),
    bindings: () => bindings,
    settings,
  });
  expect([
    s.state("test.go"),
    s.state("setting.appearance.theme.dark"),
  ]).toEqual([
    {
      enabled: false,
      visible: true,
      checked: null,
      label: "Go",
      keys: ["Mod+G"],
      whyNot: "needs a document open",
    },
    {
      enabled: true,
      visible: true,
      checked: true,
      label: "Theme: Dark",
      keys: [],
      whyNot: null,
    },
  ]);
  current = ctx({ demo: false });
  bindings = new Map();
  settings.set("appearance.theme", "light");
  expect([
    s.state("test.go"),
    s.state("test.demo").visible,
    s.state("setting.appearance.theme.dark").checked,
  ]).toEqual([
    {
      enabled: true,
      visible: true,
      checked: null,
      label: "Go",
      keys: [],
      whyNot: null,
    },
    false,
    false,
  ]);
  expect(() => s.state("test.nope")).toThrow(RangeError);
});

test("subscribers hear that the context or the bindings changed when the app says so, until they leave", () => {
  const s = service();
  const heard: string[] = [];
  const leave = s.subscribe(() => heard.push("a"));
  s.subscribe(() => heard.push("b"));
  s.state("test.go");
  s.notify();
  leave();
  s.notify();
  expect(heard).toEqual(["a", "b", "b"]);
});

test("a command with no handler is a mistake, never a silent run", () => {
  expect(() => service().run("test.go", "key")).toThrow(RangeError);
});

test("a service refuses a list that defineCommands refuses", () => {
  expect(() =>
    service({ commands: [command("test.go"), command("test.go")] }),
  ).toThrow("test.go: a command id is declared once");
});
