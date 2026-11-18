import { expect, test } from "bun:test";
import { MENU_IDS, createRegistry, setting, t } from "@manent/settings";
import type { Platform } from "@manent/settings";
import {
  COMMANDS,
  breaksLayoutRules,
  createCommandService,
  defineCommands,
  isChord,
  menuModel,
  resolveBindings,
  settingCommands,
} from "../src/index.ts";
import type {
  CommandContext,
  CommandDefinition,
  CommandHandlers,
  SettingWriter,
} from "../src/index.ts";

const PLATFORMS: readonly Platform[] = ["mac", "windows", "linux"];

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

const labelOf = (c: CommandDefinition, ctx: CommandContext): string =>
  typeof c.label === "function" ? c.label(ctx) : c.label;

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

const byId = (id: string): CommandDefinition => {
  const found = COMMANDS.find((c) => c.id === id);
  if (found === undefined) throw new RangeError(`no command ${id}`);
  return found;
};

const pick = (id: string) => {
  const { label, home, menus, palette, setting: value } = byId(id);
  return { label, home, menus, palette, setting: value };
};

const noop = (): void => {};

test("the Stage 1 commands are these, with these words and keys", () => {
  expect(
    COMMANDS.filter((c) => !c.id.startsWith("setting.")).map((c) => [
      c.id,
      labelOf(c, CTX),
      c.keys.mac,
      c.keys.windows,
    ]),
  ).toEqual([
    ["app.palette", "Commands", ["Mod+K"], ["Mod+K"]],
    ["app.goTo", "Go to", ["Mod+G"], ["Mod+G"]],
    ["app.preferences", "Preferences", ["Mod+,"], ["Mod+,"]],
    ["app.shortcuts", "Keyboard shortcuts", ["Mod+/"], ["Mod+/"]],
    ["app.nextRegion", "Next region", ["F6"], ["F6"]],
    ["app.previousRegion", "Previous region", ["Shift+F6"], ["Shift+F6"]],
    ["app.library", "Library", [], []],
    ["app.syncCentre", "Sync centre", [], []],
    ["app.signInToSync", "Sign in to sync", [], []],
    ["app.switchPerson", "Switch person", [], []],
    ["edit.undo", "Undo", ["Mod+Z"], ["Control+Z"]],
    ["edit.redo", "Redo", ["Mod+Shift+Z"], ["Control+Y", "Control+Shift+Z"]],
    ["settings.undo", "Undo", [], []],
    ["view.leftPanel", "Left panel", ["Mod+Alt+1"], []],
    ["view.sidePanel", "Side panel", ["Mod+Alt+2"], []],
    ["history.open", "History", ["Mod+Shift+H"], ["Mod+Shift+H"]],
    ["doc.scriptSettings", "Script settings", [], []],
    ["doc.rename", "Rename", [], []],
    ["library.newScript", "New script", [], []],
    ["library.newProject", "New project", [], []],
    ["demo.tour", "Tour", [], []],
  ]);
});

test("every command is well formed and reachable", () => {
  for (const c of COMMANDS) {
    // a generated setting command carries its value, and stored values are snake_case
    expect({ id: c.id, ok: /^[a-z]+(\.[a-zA-Z0-9_]+)+$/.test(c.id) }).toEqual({
      id: c.id,
      ok: true,
    });
    expect(labelOf(c, CTX).length).toBeGreaterThan(0);
    if (c.when) expect(c.whyNot).not.toBeNull();
    for (const p of PLATFORMS)
      for (const k of c.keys[p])
        expect([c.id, isChord(k), breaksLayoutRules(k, p)]).toEqual([
          c.id,
          true,
          null,
        ]);
    for (const m of c.menus) expect(MENU_IDS).toContain(m.menu);
    if ("hidden" in c.palette)
      expect(c.palette.hidden.length).toBeGreaterThan(0);
  }
});

test("no two defaults clash in overlapping scopes on any platform", () => {
  for (const platform of PLATFORMS)
    for (const shell of ["web", "desktop"] as const)
      expect(
        resolveBindings({
          commands: COMMANDS,
          custom: [],
          platform,
          shell,
          findings: { failsHere: new Set() },
        }).lostChord,
      ).toEqual([]);
});

test("a setting generates its commands, named as the palette names them", () => {
  const labels = COMMANDS.filter((c) => c.id.startsWith("setting.")).map(
    (c) => c.label,
  );
  expect(labels).toEqual(
    expect.arrayContaining([
      "Typewriter scrolling: turn on",
      "Theme: System",
      "Theme: Light",
      "Theme: Dark",
      "Interface size: 125 %",
      "Paper: A4",
    ]),
  );
});

test("a command added with one definition and one handler appears in the palette, takes a shortcut and has one label", () => {
  const extra: CommandDefinition = {
    id: "test.extra",
    label: "Extra",
    group: "view",
    home: null,
    scope: "global",
    keys: { mac: ["Mod+J"], windows: ["Mod+J"], linux: ["Mod+J"] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: null,
    checked: null,
    passThrough: null,
    menus: [{ menu: "view", group: "extra", order: 10, submenu: null }],
    palette: { keywords: [] },
    opens: null,
    reach: "self",
    setting: null,
  };
  const commands = defineCommands([...COMMANDS, extra]);
  const resolved = resolveBindings({
    commands,
    custom: [],
    platform: "mac",
    shell: "web",
    findings: { failsHere: new Set() },
  });
  const ran: string[] = [];
  const service = createCommandService({
    commands,
    handlers: { "test.extra": () => ran.push("test.extra") },
    context: () => CTX,
    settings: memorySettings({}),
    bindings: () => resolved.effective,
    onDisabled: noop,
  });
  expect([resolved.lostChord, extra.palette]).toEqual([[], { keywords: [] }]);
  expect(service.state("test.extra")).toEqual({
    enabled: true,
    visible: true,
    checked: null,
    label: "Extra",
    keys: ["Mod+J"],
    whyNot: null,
  });
  expect(
    menuModel("view", commands, service).groups.find((g) =>
      g.some((item) => item.id === "test.extra"),
    ),
  ).toEqual([
    {
      id: "test.extra",
      label: "Extra",
      enabled: true,
      checked: null,
      keys: ["Mod+J"],
      nativeRole: null,
      submenu: null,
    },
  ]);
  expect([service.run("test.extra", "palette"), ran]).toEqual([
    "ran",
    ["test.extra"],
  ]);
});

test("every setting command has a fixed id, so a stored shortcut keeps finding it", () => {
  expect(
    COMMANDS.filter((c) => c.id.startsWith("setting.")).map((c) => c.id),
  ).toEqual([
    "setting.writing.enterAfterDialogue.action",
    "setting.writing.enterAfterDialogue.character",
    "setting.writing.typewriterScrolling",
    "setting.writing.checkSpelling",
    "setting.writing.showCursors",
    "setting.writing.announce.elements",
    "setting.writing.announce.elements_pages",
    "setting.writing.announce.elements_pages_people",
    "setting.appearance.theme.system",
    "setting.appearance.theme.light",
    "setting.appearance.theme.dark",
    "setting.appearance.whitePage",
    "setting.device.interfaceSize.100",
    "setting.device.interfaceSize.125",
    "setting.device.interfaceSize.150",
    "setting.device.interfaceSize.200",
    "setting.script.format.screenplay",
    "setting.script.format.multicam",
    "setting.script.format.animation",
    "setting.script.format.variety",
    "setting.script.format.game",
    "setting.script.format.ink",
    "setting.script.format.manuscript",
    "setting.script.format.stage_play",
    "setting.script.paper.letter",
    "setting.script.paper.a4",
    "setting.script.moresAtBreaks",
    "setting.script.sameSpeakerContd",
    "setting.script.sceneContinued",
  ]);
});

test("a choice is one command per value under a submenu, a switch one command that turns it over", () => {
  expect([
    pick("setting.appearance.theme.dark"),
    pick("setting.writing.typewriterScrolling"),
  ]).toEqual([
    {
      label: "Theme: Dark",
      home: "homePreferences:appearance",
      menus: [{ menu: "view", group: "theme", order: 10, submenu: "Theme" }],
      palette: { keywords: ["night mode"] },
      setting: { key: "appearance.theme", value: "dark" },
    },
    {
      label: "Typewriter scrolling: turn on",
      home: "homePreferences:writing",
      menus: [{ menu: "view", group: "writing", order: 10, submenu: null }],
      palette: { keywords: [] },
      setting: { key: "writing.typewriterScrolling", value: null },
    },
  ]);
});

test("a setting command is checked while its value holds, and running it sets the value", () => {
  const settings = memorySettings({
    "appearance.theme": "dark",
    "writing.typewriterScrolling": false,
  });
  const service = createCommandService({
    commands: COMMANDS,
    handlers: {},
    context: () => CTX,
    settings,
    bindings: () => new Map(),
    onDisabled: noop,
  });
  const checked = (): (boolean | null)[] =>
    [
      "setting.appearance.theme.light",
      "setting.appearance.theme.dark",
      "setting.writing.typewriterScrolling",
    ].map((id) => service.state(id).checked);
  expect(checked()).toEqual([false, true, false]);
  service.run("setting.appearance.theme.light", "palette");
  service.run("setting.writing.typewriterScrolling", "menu");
  expect([
    settings.get("appearance.theme"),
    settings.get("writing.typewriterScrolling"),
    checked(),
  ]).toEqual(["light", true, [true, false, true]]);
});

test("a script setting lives in Script settings and is absent off a document", () => {
  const paper = byId("setting.script.paper.a4");
  expect([
    paper.home,
    byId("doc.scriptSettings").home,
    paper.visible?.(CTX),
    paper.visible?.({ ...CTX, docOpen: false }),
  ]).toEqual(["homeScriptSettings", "homeScriptSettings", true, false]);
});

test("only Script settings and the preferences have a home in the palette", () => {
  const homes = new Set(COMMANDS.map((c) => c.home));
  expect([...homes].toSorted()).toEqual([
    "homePreferences:appearance",
    "homePreferences:device",
    "homePreferences:writing",
    "homeScriptSettings",
    null,
  ]);
  expect(
    COMMANDS.filter((c) => c.home !== null && !c.id.startsWith("setting.")).map(
      (c) => c.id,
    ),
  ).toEqual(["doc.scriptSettings"]);
});

test("a setting that is not offered in the palette generates commands hidden from it", () => {
  const registry = createRegistry(
    [
      setting({
        key: "writing.sample",
        scope: "personal",
        type: t.boolean(),
        default: false,
        label: "Sample",
        description: null,
        noun: null,
        surfaces: [{ in: "preferences", section: "writing", order: 10 }],
        apply: { how: "read" },
        boot: false,
        guard: null,
        keywords: [],
      }),
    ],
    [],
    [],
  );
  expect(settingCommands(registry).map((c) => [c.id, c.palette])).toEqual([
    [
      "setting.writing.sample",
      { hidden: "the setting is not offered in the palette" },
    ],
  ]);
});

test("the handler table names every command but the generated ones", () => {
  const table: CommandHandlers = {
    "app.palette": noop,
    "app.goTo": noop,
    "app.preferences": noop,
    "app.shortcuts": noop,
    "app.nextRegion": noop,
    "app.previousRegion": noop,
    "app.library": noop,
    "app.syncCentre": noop,
    "app.signInToSync": noop,
    "app.switchPerson": noop,
    "edit.undo": noop,
    "edit.redo": noop,
    "settings.undo": noop,
    "view.leftPanel": noop,
    "view.sidePanel": noop,
    "history.open": noop,
    "doc.scriptSettings": noop,
    "doc.rename": noop,
    "library.newScript": noop,
    "library.newProject": noop,
    "demo.tour": noop,
  };
  expect(Object.keys(table).toSorted()).toEqual(
    COMMANDS.filter((c) => !c.id.startsWith("setting."))
      .map((c) => c.id)
      .toSorted(),
  );
});
