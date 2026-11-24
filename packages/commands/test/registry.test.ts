import { expect, test } from "bun:test";
import { MENU_IDS, createRegistry, setting, t } from "@manent/settings";
import type { Platform } from "@manent/settings";
import {
  COMMANDS,
  EDITOR_COMMANDS,
  ELEMENT_COMMAND_SLOTS,
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
  workspace: "writable",
  panelOpen: { left: false, side: false },
  historyPresent: false,
  format: null,
  rulerShown: false,
  layoutView: "page",
  spaceBeforeSet: false,
  zoom: null,
  zoomPercent: null,
  production: null,
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
};

const ctx = (over: Partial<CommandContext>): CommandContext => ({
  ...CTX,
  ...over,
});

const labelOf = (c: CommandDefinition, context: CommandContext): string =>
  typeof c.label === "function"
    ? c.label(context, { get: () => undefined })
    : c.label;

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
  const { home, menus, palette, setting: value } = byId(id);
  return {
    label: labelOf(byId(id), CTX),
    home,
    menus,
    palette,
    setting: value,
  };
};

const noop = (): void => {};

// Frozen, and checked as a subset in order, so a command added later never breaks the pin.
const STAGE_1_COMMANDS: [string, string, string[], string[]][] = [
  ["app.palette", "Commands", ["Mod+K"], ["Mod+K"]],
  ["app.goTo", "Go to", ["Mod+G"], ["Mod+G"]],
  ["app.preferences", "Preferences", ["Mod+,"], ["Mod+,"]],
  ["app.shortcuts", "Keyboard shortcuts", ["Mod+/"], ["Mod+/"]],
  ["app.aiPledge", "AI pledge", [], []],
  ["app.nextRegion", "Next region", ["F6"], ["F6"]],
  ["app.previousRegion", "Previous region", ["Shift+F6"], ["Shift+F6"]],
  ["app.library", "Library", [], []],
  ["app.syncCentre", "Sync centre", [], []],
  ["app.signInToSync", "Sign in to sync", [], []],
  ["app.switchPerson", "Switch person", [], []],
  ["edit.undo", "Undo", ["Mod+Z"], ["Control+Z"]],
  ["edit.redo", "Redo", ["Mod+Shift+Z"], ["Control+Y", "Control+Shift+Z"]],
  ["edit.find", "Find", ["Mod+F"], ["Mod+F"]],
  ["settings.undo", "Undo", [], []],
  ["view.leftPanel", "Left panel", ["Mod+Alt+1"], []],
  ["view.sidePanel", "Side panel", ["Mod+Alt+2"], []],
  ["history.open", "History", ["Mod+Shift+H"], ["Mod+Shift+H"]],
  ["doc.scriptSettings", "Script settings", [], []],
  ["doc.rename", "Rename", [], []],
  ["format.element", "Element", ["Alt+Enter"], ["Alt+Enter"]],
  ["element.sceneHeading", "Scene Heading", ["Mod+1"], ["Mod+1"]],
  ["element.action", "Action", ["Mod+2"], ["Mod+2"]],
  ["element.character", "Character", ["Mod+3"], ["Mod+3"]],
  ["element.parenthetical", "Parenthetical", ["Mod+4"], ["Mod+4"]],
  ["element.dialogue", "Dialogue", ["Mod+5"], ["Mod+5"]],
  ["element.transition", "Transition", ["Mod+6"], ["Mod+6"]],
  ["element.shot", "Shot", ["Mod+7"], ["Mod+7"]],
  ["element.section", "Section", ["Mod+8"], ["Mod+8"]],
  ["element.newAct", "New Act", ["Mod+9"], ["Mod+9"]],
  ["element.general", "General", [], []],
  ["element.endOfAct", "End of Act", [], []],
  ["element.emote", "Emote", [], []],
  ["element.camera", "Camera", [], []],
  ["element.engineDirection", "Engine Direction", [], []],
  ["format.dualDialogue", "Dual dialogue", ["Mod+D"], ["Mod+D"]],
  ["format.pageBreak", "Page break", ["Mod+Enter"], ["Mod+Enter"]],
  ["format.bold", "Bold", ["Mod+B"], ["Mod+B"]],
  ["format.italic", "Italic", ["Mod+I"], ["Mod+I"]],
  ["format.underline", "Underline", ["Mod+U"], ["Mod+U"]],
  ["format.strike", "Strikethrough", [], []],
  ["format.caps", "All-caps", [], []],
  ["format.alignLeft", "Align left", [], []],
  ["format.alignCenter", "Align centre", [], []],
  ["format.alignRight", "Align right", [], []],
  ["format.spaceBefore", "Space before", [], []],
  ["format.colour.none", "Text colour: None", [], []],
  ["format.colour.red", "Text colour: Red", [], []],
  ["format.colour.orange", "Text colour: Orange", [], []],
  ["format.colour.green", "Text colour: Green", [], []],
  ["format.colour.blue", "Text colour: Blue", [], []],
  ["format.colour.violet", "Text colour: Violet", [], []],
  ["format.highlight.none", "Highlight: None", [], []],
  ["format.highlight.yellow", "Highlight: Yellow", [], []],
  ["format.highlight.green", "Highlight: Green", [], []],
  ["format.highlight.pink", "Highlight: Pink", [], []],
  ["format.highlight.orange", "Highlight: Orange", [], []],
  ["format.highlight.violet", "Highlight: Violet", [], []],
  ["view.pageView", "Page view", [], []],
  ["view.reflow", "Reflow view", [], []],
  ["view.ruler", "Ruler", [], []],
  ["format.titlePage", "Title page", [], []],
  ["doc.export", "Export…", [], []],
  ["doc.print", "Print…", ["Mod+P"], ["Mod+P"]],
  ["view.zoomIn", "Zoom in", ["Mod+="], ["Mod+="]],
  ["view.zoomOut", "Zoom out", ["Mod+-"], ["Mod+-"]],
  ["view.zoomFitWidth", "Zoom: Fit width", [], []],
  ["view.zoom50", "Zoom: 50\u00a0%", [], []],
  ["view.zoom75", "Zoom: 75\u00a0%", [], []],
  ["view.zoom100", "Zoom: 100\u00a0%", ["Mod+0"], ["Mod+0"]],
  ["view.zoom125", "Zoom: 125\u00a0%", [], []],
  ["view.zoom150", "Zoom: 150\u00a0%", [], []],
  ["view.zoom200", "Zoom: 200\u00a0%", [], []],
  ["view.zoom300", "Zoom: 300\u00a0%", [], []],
  ["nav.nextScene", "Next scene", ["Mod+Alt+ArrowDown"], []],
  ["nav.previousScene", "Previous scene", ["Mod+Alt+ArrowUp"], []],
  ["nav.whereAmI", "Where am I?", [], []],
  ["library.newScript", "New script", [], []],
  ["library.newProject", "New project", [], []],
  ["file.import", "Import…", [], []],
  ["file.open", "Open…", ["Mod+O"], ["Mod+O"]],
  ["file.importAgain", "Import again as a new script", [], []],
  ["history.review", "Review", [], []],
  ["review.undo", "Undo", [], []],
  ["demo.tour", "Tour", [], []],
  ["app.openInBrowser", "Open in browser", [], []],
  ["history.markVersion", "Mark a version", ["Mod+S"], ["Mod+S"]],
  ["history.nameDraft", "Name this draft…", ["Mod+Shift+S"], ["Mod+Shift+S"]],
  ["history.changesSince", "Changes since", [], []],
  ["history.hideChanges", "Hide", [], []],
  ["history.showSinceOpened", "Show", [], []],
  ["history.dismissSinceOpened", "Dismiss", [], []],
  ["history.backToWorking", "Back to Working", [], []],
  ["history.nextChange", "Next change", [], []],
  ["history.previousChange", "Previous change", [], []],
  ["history.restore", "Restore", [], []],
  ["history.restoreScene", "Restore this scene", [], []],
  ["history.restoreBefore", "Restore 'Before restore'", [], []],
  ["history.seeWhatChanged", "See what changed", [], []],
  ["history.openRecoveredBeside", "Open beside", [], []],
  ["history.whoWrote", "Who wrote this?", [], []],
  ["production.lock", "Lock for production…", [], []],
  ["production.issue", "Issue…", [], []],
  ["production.recall", "Recall…", [], []],
  ["production.markRevised", "Mark revised", ["Mod+Shift+]"], ["Mod+Shift+]"]],
  [
    "production.clearRevised",
    "Clear revised",
    ["Mod+Shift+["],
    ["Mod+Shift+["],
  ],
  ["production.lockPages", "Lock or unlock page numbers", [], []],
  ["production.lockAPages", "Lock A-pages", [], []],
  ["production.renumber", "Renumber", [], []],
  ["production.omitScene", "Omit scene", [], []],
  ["production.bringBackScene", "Bring back scene", [], []],
  ["production.changeLayout", "Change layout…", [], []],
  ["production.unlock", "Unlock…", [], []],
  ["production.end", "End production…", [], []],
  ["view.pages", "Pages", [], []],
  ["view.marks.collated", "Revision marks: Collated", [], []],
  ["view.marks.this_revision", "Revision marks: This revision only", [], []],
  ["view.marks.all", "Revision marks: All revisions", [], []],
  [
    "view.marks.since_full_draft",
    "Revision marks: Since the last full draft",
    [],
    [],
  ],
  ["view.marks.none", "Revision marks: None", [], []],
  ["view.colourRevised", "Colour revised pages", [], []],
];

const STAGE_1_COMMAND_IDS: string[] = STAGE_1_COMMANDS.map(([id]) => id);

test("the Stage 1 commands are these, with these words and keys", () => {
  expect(
    COMMANDS.filter((c) => STAGE_1_COMMAND_IDS.includes(c.id)).map((c) => [
      c.id,
      labelOf(c, CTX),
      c.keys.mac,
      c.keys.windows,
    ]),
  ).toEqual(STAGE_1_COMMANDS);
});

test("the editor's commands sit in these menus and answer to these palette words", () => {
  const placed: unknown = EDITOR_COMMANDS.filter(
    (c) =>
      c.menus.length > 0 ||
      ("keywords" in c.palette && c.palette.keywords.length > 0),
  ).map((c) => [c.id, c.group, c.menus, c.palette, c.opens]);
  expect(placed).toEqual([
    [
      "format.element",
      "format",
      [{ menu: "format", group: "element", order: 10, submenu: null }],
      { keywords: ["block type", "line type"] },
      null,
    ],
    ["element.sceneHeading", "format", [], { keywords: ["slugline"] }, null],
    [
      "format.dualDialogue",
      "format",
      [{ menu: "format", group: "speech", order: 10, submenu: null }],
      { keywords: [] },
      null,
    ],
    [
      "format.pageBreak",
      "format",
      [{ menu: "format", group: "break", order: 10, submenu: null }],
      { keywords: [] },
      null,
    ],
    ...(
      [
        ["format.bold", "styles", 10],
        ["format.italic", "styles", 20],
        ["format.underline", "styles", 30],
        ["format.strike", "styles", 40],
        ["format.caps", "styles", 50],
        ["format.alignLeft", "align", 10],
        ["format.alignCenter", "align", 20],
        ["format.alignRight", "align", 30],
        ["format.spaceBefore", "align", 40],
      ] as const
    ).map(([id, group, order]) => [
      id,
      "format",
      [{ menu: "format", group, order, submenu: null }],
      { keywords: [] },
      null,
    ]),
    [
      "view.pageView",
      "view",
      [{ menu: "view", group: "page", order: 1, submenu: null }],
      { keywords: [] },
      null,
    ],
    [
      "view.reflow",
      "view",
      [{ menu: "view", group: "page", order: 2, submenu: null }],
      { keywords: [] },
      null,
    ],
    [
      "view.ruler",
      "view",
      [{ menu: "view", group: "page", order: 10, submenu: null }],
      { keywords: [] },
      null,
    ],
    [
      "format.titlePage",
      "format",
      [{ menu: "format", group: "script_settings", order: 20, submenu: null }],
      { keywords: [] },
      null,
    ],
    [
      "doc.export",
      "file",
      [
        { menu: "title", group: "send", order: 20, submenu: null },
        { menu: "file", group: "send", order: 10, submenu: null },
      ],
      { keywords: ["pdf", "download", "save as"] },
      { surface: "send", focus: "first" },
    ],
    [
      "doc.print",
      "file",
      [
        { menu: "title", group: "send", order: 30, submenu: null },
        { menu: "file", group: "send", order: 20, submenu: null },
      ],
      { keywords: [] },
      { surface: "send", focus: "first" },
    ],
    ...(
      [
        ["view.zoomIn", 90],
        ["view.zoomOut", 100],
        ["view.zoomFitWidth", 10],
        ["view.zoom50", 20],
        ["view.zoom75", 30],
        ["view.zoom100", 40],
        ["view.zoom125", 50],
        ["view.zoom150", 60],
        ["view.zoom200", 70],
        ["view.zoom300", 80],
      ] as const
    ).map(([id, order]) => [
      id,
      "view",
      [{ menu: "view", group: "zoom", order, submenu: "Zoom" }],
      { keywords: [] },
      null,
    ]),
  ]);
});

test("Open in browser sits in File and is offered only in the desktop app's demo", () => {
  const open = byId("app.openInBrowser");
  expect([
    pick("app.openInBrowser"),
    open.scope,
    open.reach,
    open.opens,
    [
      ctx({ shell: "desktop", demo: true }),
      ctx({ shell: "desktop", demo: false }),
      ctx({ shell: "web", demo: true }),
    ].map((context) => open.visible?.(context)),
  ]).toEqual([
    {
      label: "Open in browser",
      home: null,
      menus: [{ menu: "file", group: "browser", order: 80, submenu: null }],
      palette: { keywords: [] },
      setting: null,
    },
    "global",
    "self",
    null,
    [true, false, false],
  ]);
});

test("the editor's commands belong to the page and appear only to people who can edit", () => {
  for (const c of EDITOR_COMMANDS.filter((d) => d.scope === "editor"))
    expect([
      c.id,
      c.visible!(ctx({ docOpen: true, role: "commenter" })),
      c.visible!(ctx({ docOpen: true, role: "editor" })),
    ]).toEqual([c.id, false, true]);
  expect(
    EDITOR_COMMANDS.filter((c) => c.scope !== "editor").map((c) => c.id),
  ).toEqual([
    "view.pageView",
    "view.reflow",
    "view.ruler",
    "format.titlePage",
    "doc.export",
    "doc.print",
    "view.zoomIn",
    "view.zoomOut",
    "view.zoomFitWidth",
    "view.zoom50",
    "view.zoom75",
    "view.zoom100",
    "view.zoom125",
    "view.zoom150",
    "view.zoom200",
    "view.zoom300",
  ]);
});

/** "ran" when the editor command `id` can run in `c`, else its reason. */
const state = (id: string, c: Partial<CommandContext>) => {
  const d = EDITOR_COMMANDS.find((x) => x.id === id)!;
  const k = ctx(c);
  return d.when!(k) ? "ran" : d.whyNot!(k);
};

test("Ruler, Export and Print are disabled with their reason off a document and in Ink, and run for a viewer", () => {
  expect(
    ["view.ruler", "doc.export", "doc.print"].map((id) => [
      state(id, { docOpen: false }),
      state(id, { docOpen: true, format: "ink" }),
      state(id, { docOpen: true, format: "screenplay", role: "viewer" }),
    ]),
  ).toEqual(
    Array.from({ length: 3 }, () => [
      "needs a document open",
      "isn't part of the Ink format",
      "ran",
    ]),
  );
});

test("Zoom in and out stop at the ends and say why", () => {
  expect([
    state("view.zoomIn", {
      docOpen: true,
      format: "screenplay",
      zoomPercent: 300,
    }),
    state("view.zoomOut", {
      docOpen: true,
      format: "screenplay",
      zoomPercent: 50,
    }),
    state("view.zoomIn", { docOpen: true, format: "ink", zoomPercent: null }),
  ]).toEqual([
    "isn't available at 300\u00a0%",
    "isn't available at 50\u00a0%",
    "isn't part of the Ink format",
  ]);
});

test("the zoom keys are the desktop's, and the browser keeps them on the web", () => {
  for (const platform of PLATFORMS) {
    const at = (shell: "web" | "desktop") =>
      resolveBindings({
        commands: COMMANDS,
        custom: [],
        platform,
        shell,
        findings: { failsHere: new Set() },
      }).effective;
    expect([
      at("desktop").get("view.zoomIn"),
      at("web").get("view.zoomIn") ?? [],
    ]).toEqual([["Mod+="], []]);
  }
});

test("every element command names its key in the element picker", () => {
  expect(ELEMENT_COMMAND_SLOTS).toEqual({
    "element.sceneHeading": "1",
    "element.action": "2",
    "element.character": "3",
    "element.parenthetical": "4",
    "element.dialogue": "5",
    "element.transition": "6",
    "element.shot": "7",
    "element.section": "8",
    "element.newAct": "9",
    "element.general": "0",
    "element.endOfAct": "E",
    "element.emote": "M",
    "element.camera": "C",
    "element.engineDirection": "G",
  });
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
  const labels = COMMANDS.filter((c) => c.id.startsWith("setting.")).map((c) =>
    labelOf(c, CTX),
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

// Frozen, and checked as a subset in order, so a setting added later never breaks the pin.
const STAGE_1_SETTING_COMMAND_IDS: string[] = [
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
  "setting.script.numbering.suffix",
  "setting.script.numbering.prefix",
  "setting.script.colourOrder.standard",
  "setting.script.colourOrder.extended",
];

test("every setting command has a fixed id, so a stored shortcut keeps finding it", () => {
  expect(
    COMMANDS.filter((c) => STAGE_1_SETTING_COMMAND_IDS.includes(c.id)).map(
      (c): string => c.id,
    ),
  ).toEqual(STAGE_1_SETTING_COMMAND_IDS);
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
  const switchLabel = (): string =>
    service.state("setting.writing.typewriterScrolling").label;
  expect([checked(), switchLabel()]).toEqual([
    [false, true, false],
    "Typewriter scrolling: turn on",
  ]);
  service.run("setting.appearance.theme.light", "palette");
  service.run("setting.writing.typewriterScrolling", "menu");
  expect([
    settings.get("appearance.theme"),
    settings.get("writing.typewriterScrolling"),
    checked(),
    switchLabel(),
  ]).toEqual([
    "light",
    true,
    [true, false, true],
    "Typewriter scrolling: turn off",
  ]);
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

test("only Script settings, the preferences and Lock for production have a home in the palette", () => {
  const homes = new Set(COMMANDS.map((c) => c.home));
  expect([...homes].toSorted()).toEqual([
    "homeBeforeLock",
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
  ).toEqual(["doc.scriptSettings", "production.lock"]);
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
    "app.aiPledge": noop,
    "app.nextRegion": noop,
    "app.previousRegion": noop,
    "app.library": noop,
    "app.syncCentre": noop,
    "app.signInToSync": noop,
    "app.switchPerson": noop,
    "edit.undo": noop,
    "edit.redo": noop,
    "edit.find": noop,
    "settings.undo": noop,
    "view.leftPanel": noop,
    "view.sidePanel": noop,
    "history.open": noop,
    "doc.scriptSettings": noop,
    "doc.rename": noop,
    "format.element": noop,
    "element.sceneHeading": noop,
    "element.action": noop,
    "element.character": noop,
    "element.parenthetical": noop,
    "element.dialogue": noop,
    "element.transition": noop,
    "element.shot": noop,
    "element.section": noop,
    "element.newAct": noop,
    "element.general": noop,
    "element.endOfAct": noop,
    "element.emote": noop,
    "element.camera": noop,
    "element.engineDirection": noop,
    "format.dualDialogue": noop,
    "format.pageBreak": noop,
    "format.bold": noop,
    "format.italic": noop,
    "format.underline": noop,
    "format.strike": noop,
    "format.caps": noop,
    "format.alignLeft": noop,
    "format.alignCenter": noop,
    "format.alignRight": noop,
    "format.spaceBefore": noop,
    "format.colour.none": noop,
    "format.colour.red": noop,
    "format.colour.orange": noop,
    "format.colour.green": noop,
    "format.colour.blue": noop,
    "format.colour.violet": noop,
    "format.highlight.none": noop,
    "format.highlight.yellow": noop,
    "format.highlight.green": noop,
    "format.highlight.pink": noop,
    "format.highlight.orange": noop,
    "format.highlight.violet": noop,
    "view.pageView": noop,
    "view.reflow": noop,
    "view.ruler": noop,
    "format.titlePage": noop,
    "doc.export": noop,
    "doc.print": noop,
    "view.zoomIn": noop,
    "view.zoomOut": noop,
    "view.zoomFitWidth": noop,
    "view.zoom50": noop,
    "view.zoom75": noop,
    "view.zoom100": noop,
    "view.zoom125": noop,
    "view.zoom150": noop,
    "view.zoom200": noop,
    "view.zoom300": noop,
    "nav.nextScene": noop,
    "nav.previousScene": noop,
    "nav.whereAmI": noop,
    "library.newScript": noop,
    "library.newProject": noop,
    "file.import": noop,
    "file.open": noop,
    "file.importAgain": noop,
    "history.review": noop,
    "review.undo": noop,
    "demo.tour": noop,
    "app.openInBrowser": noop,
    "history.markVersion": noop,
    "history.nameDraft": noop,
    "history.changesSince": noop,
    "history.hideChanges": noop,
    "history.showSinceOpened": noop,
    "history.dismissSinceOpened": noop,
    "history.backToWorking": noop,
    "history.nextChange": noop,
    "history.previousChange": noop,
    "history.restore": noop,
    "history.restoreScene": noop,
    "history.restoreBefore": noop,
    "history.seeWhatChanged": noop,
    "history.openRecoveredBeside": noop,
    "doc.openBeside": noop,
    "doc.duplicate": noop,
    "doc.duplicateVersion": noop,
    "copy.openCopyBeside": noop,
    "library.exportProject": noop,
    "history.whoWrote": noop,
    "production.lock": noop,
    "production.issue": noop,
    "production.recall": noop,
    "production.markRevised": noop,
    "production.clearRevised": noop,
    "production.lockPages": noop,
    "production.lockAPages": noop,
    "production.renumber": noop,
    "production.omitScene": noop,
    "production.bringBackScene": noop,
    "production.changeLayout": noop,
    "production.unlock": noop,
    "production.end": noop,
    "view.pages": noop,
    "view.marks.collated": noop,
    "view.marks.this_revision": noop,
    "view.marks.all": noop,
    "view.marks.since_full_draft": noop,
    "view.marks.none": noop,
    "view.colourRevised": noop,
    "room.follow": noop,
    "room.stopFollowing": noop,
    "room.takeKeys": noop,
    "room.pitch": noop,
    "view.presentToRoom": noop,
    "share.open": noop,
    "writing.forEveryone": noop,
    "writing.asSuggestions": noop,
    "writing.privately": noop,
    "writing.stopSuggestions": noop,
    "writing.handIn": noop,
    "writing.restoreBeforeHandIn": noop,
    "writing.seeHandedIn": noop,
    "alternate.show": noop,
    "alternate.add": noop,
    "doc.copyLink": noop,
    "history.copyLink": noop,
    "name.useListed": noop,
    "name.addToProject": noop,
    "project.openSettings": noop,
    "scene.moveUp": noop,
    "scene.moveDown": noop,
  };
  expect(Object.keys(table).toSorted()).toEqual(
    COMMANDS.filter((c) => !c.id.startsWith("setting."))
      .map((c) => c.id)
      .toSorted(),
  );
});
