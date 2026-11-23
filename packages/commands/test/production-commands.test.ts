import { expect, test } from "bun:test";
import { COMMANDS, createCommandService, menuModel } from "../src/index.ts";
import type { CommandContext, CommandDefinition } from "../src/index.ts";

type Production = NonNullable<CommandContext["production"]>;

const LOCKED: Production = {
  locked: true,
  canLock: true,
  canIssue: true,
  recallOpen: true,
  waiting: 0,
  activeName: "Pink",
  recallName: "Blue",
  selection: null,
  mode: "collated",
  tint: false,
};

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
  production: LOCKED,
};

const at = (
  production: Partial<Production> | null,
  over: Partial<CommandContext> = {},
): CommandContext => ({
  ...CTX,
  ...over,
  production: production === null ? null : { ...LOCKED, ...production },
});

const PRODUCTION_IDS = [
  "production.lock",
  "production.issue",
  "production.recall",
  "production.markRevised",
  "production.clearRevised",
  "production.lockPages",
  "production.lockAPages",
  "production.renumber",
  "production.omitScene",
  "production.bringBackScene",
  "production.changeLayout",
  "production.unlock",
  "production.end",
  "view.pages",
  "view.marks.collated",
  "view.marks.this_revision",
  "view.marks.all",
  "view.marks.since_full_draft",
  "view.marks.none",
  "view.colourRevised",
];

const productionCommands = (): CommandDefinition[] =>
  PRODUCTION_IDS.map((id) => {
    const found = COMMANDS.find((c) => c.id === id);
    if (found === undefined) throw new RangeError(`no command ${id}`);
    return found;
  });

const serviceAt = (context: CommandContext) =>
  createCommandService({
    commands: COMMANDS,
    handlers: {},
    context: () => context,
    settings: { get: () => undefined, set: () => ({ ok: true }) },
    bindings: () => new Map(),
    onDisabled: () => {},
  });

/** The production commands shown in `context`, each with its reason when it cannot run. */
const shownAt = (context: CommandContext): (string | [string, string])[] => {
  const service = serviceAt(context);
  return PRODUCTION_IDS.flatMap((id): (string | [string, string])[] => {
    const state = service.state(id);
    if (!state.visible) return [];
    return state.whyNot === null ? [id] : [[id, state.whyNot]];
  });
};

const menu = (
  menuId: "production" | "title" | "view",
  group: string,
  order: number,
  submenu: string | null = null,
) => ({ menu: menuId, group, order, submenu });

test("the production commands are these, with these words, menus and conditions", () => {
  expect(
    productionCommands().map((c) => [
      c.id,
      typeof c.label === "function"
        ? c.label(CTX, { get: () => undefined })
        : c.label,
      c.home,
      c.menus,
      c.palette,
      c.opens,
    ]),
  ).toEqual([
    [
      "production.lock",
      "Lock for production…",
      "homeBeforeLock",
      [menu("production", "lock", 10), menu("title", "production", 10)],
      { keywords: ["issue", "blue pages", "revision"] },
      { surface: "consequence_dialog", focus: "item" },
    ],
    [
      "production.issue",
      "Issue Pink…",
      null,
      [menu("production", "issue", 10)],
      { keywords: [] },
      { surface: "send", focus: "stay" },
    ],
    [
      "production.recall",
      "Recall Blue…",
      null,
      [menu("production", "issue", 20)],
      { keywords: [] },
      { surface: "send", focus: "stay" },
    ],
    [
      "production.markRevised",
      "Mark revised",
      null,
      [menu("production", "marks", 10)],
      { keywords: [] },
      null,
    ],
    [
      "production.clearRevised",
      "Clear revised",
      null,
      [menu("production", "marks", 20)],
      { keywords: [] },
      null,
    ],
    [
      "production.lockPages",
      "Lock or unlock page numbers",
      null,
      [menu("production", "pages", 10)],
      { keywords: [] },
      null,
    ],
    [
      "production.lockAPages",
      "Lock A-pages",
      null,
      [menu("production", "pages", 20)],
      { keywords: [] },
      null,
    ],
    [
      "production.renumber",
      "Renumber",
      null,
      [menu("production", "pages", 30)],
      { keywords: [] },
      null,
    ],
    [
      "production.omitScene",
      "Omit scene",
      null,
      [menu("production", "scenes", 10)],
      { keywords: [] },
      null,
    ],
    [
      "production.bringBackScene",
      "Bring back scene",
      null,
      [menu("production", "scenes", 10)],
      { keywords: [] },
      null,
    ],
    [
      "production.changeLayout",
      "Change layout…",
      null,
      [],
      { keywords: [] },
      { surface: "consequence_dialog", focus: "item" },
    ],
    [
      "production.unlock",
      "Unlock…",
      null,
      [menu("production", "end", 10)],
      { keywords: [] },
      { surface: "consequence_dialog", focus: "item" },
    ],
    [
      "production.end",
      "End production…",
      null,
      [menu("production", "end", 20)],
      { keywords: [] },
      { surface: "consequence_dialog", focus: "item" },
    ],
    [
      "view.pages",
      "Pages",
      null,
      [menu("view", "panels", 15)],
      { keywords: [] },
      { surface: "left_panel", focus: "first" },
    ],
    [
      "view.marks.collated",
      "Revision marks: Collated",
      null,
      [menu("view", "revisions", 10, "Revision marks")],
      { keywords: [] },
      null,
    ],
    [
      "view.marks.this_revision",
      "Revision marks: This revision only",
      null,
      [menu("view", "revisions", 20, "Revision marks")],
      { keywords: [] },
      null,
    ],
    [
      "view.marks.all",
      "Revision marks: All revisions",
      null,
      [menu("view", "revisions", 30, "Revision marks")],
      { keywords: [] },
      null,
    ],
    [
      "view.marks.since_full_draft",
      "Revision marks: Since the last full draft",
      null,
      [menu("view", "revisions", 40, "Revision marks")],
      { keywords: [] },
      null,
    ],
    [
      "view.marks.none",
      "Revision marks: None",
      null,
      [menu("view", "revisions", 50, "Revision marks")],
      { keywords: [] },
      null,
    ],
    [
      "view.colourRevised",
      "Colour revised pages",
      null,
      [menu("view", "revisions", 60)],
      { keywords: [] },
      null,
    ],
  ]);
  expect(
    [
      ...new Set(
        productionCommands().map((c) =>
          JSON.stringify([c.scope, c.keys, c.keysFixed, c.reach, c.setting]),
        ),
      ),
    ].map((text): unknown => JSON.parse(text)),
  ).toEqual([
    ["editor", { mac: [], windows: [], linux: [] }, false, "others", null],
    [
      "editor",
      {
        mac: ["Mod+Shift+]"],
        windows: ["Mod+Shift+]"],
        linux: ["Mod+Shift+]"],
      },
      false,
      "others",
      null,
    ],
    [
      "editor",
      {
        mac: ["Mod+Shift+["],
        windows: ["Mod+Shift+["],
        linux: ["Mod+Shift+["],
      },
      false,
      "others",
      null,
    ],
  ]);
  expect([
    shownAt(at(null)),
    shownAt(at({ locked: false, recallOpen: false })),
    shownAt(at({ locked: false, recallOpen: false, canLock: false })),
    shownAt(at({ selection: "text" })),
    shownAt(at({ canLock: false, canIssue: false, recallOpen: false })),
    shownAt(at({ recallOpen: false, selection: "scene" })),
    shownAt(at({ recallOpen: false, selection: "omitted_scene" })),
    shownAt(at({ recallOpen: false, selection: "pages" })),
  ]).toEqual([
    [],
    ["production.lock"],
    [],
    [
      "production.issue",
      "production.recall",
      "production.markRevised",
      "production.clearRevised",
      ["production.lockPages", "needs pages selected in the Pages tab"],
      ["production.lockAPages", "needs pages selected in the Pages tab"],
      ["production.renumber", "needs pages selected in the Pages tab"],
      "production.changeLayout",
      "production.unlock",
      "production.end",
      "view.pages",
      "view.marks.collated",
      "view.marks.this_revision",
      "view.marks.all",
      "view.marks.since_full_draft",
      "view.marks.none",
      "view.colourRevised",
    ],
    [
      ["production.markRevised", "needs a selection"],
      ["production.clearRevised", "needs a selection"],
      "view.pages",
      "view.marks.collated",
      "view.marks.this_revision",
      "view.marks.all",
      "view.marks.since_full_draft",
      "view.marks.none",
      "view.colourRevised",
    ],
    [
      "production.issue",
      "production.markRevised",
      "production.clearRevised",
      ["production.lockPages", "needs pages selected in the Pages tab"],
      ["production.lockAPages", "needs pages selected in the Pages tab"],
      ["production.renumber", "needs pages selected in the Pages tab"],
      "production.omitScene",
      "production.changeLayout",
      "production.unlock",
      "production.end",
      "view.pages",
      "view.marks.collated",
      "view.marks.this_revision",
      "view.marks.all",
      "view.marks.since_full_draft",
      "view.marks.none",
      "view.colourRevised",
    ],
    [
      "production.issue",
      ["production.markRevised", "needs a selection"],
      ["production.clearRevised", "needs a selection"],
      ["production.lockPages", "needs pages selected in the Pages tab"],
      ["production.lockAPages", "needs pages selected in the Pages tab"],
      ["production.renumber", "needs pages selected in the Pages tab"],
      "production.bringBackScene",
      "production.changeLayout",
      "production.unlock",
      "production.end",
      "view.pages",
      "view.marks.collated",
      "view.marks.this_revision",
      "view.marks.all",
      "view.marks.since_full_draft",
      "view.marks.none",
      "view.colourRevised",
    ],
    [
      "production.issue",
      ["production.markRevised", "needs a selection"],
      ["production.clearRevised", "needs a selection"],
      "production.lockPages",
      "production.lockAPages",
      "production.renumber",
      "production.changeLayout",
      "production.unlock",
      "production.end",
      "view.pages",
      "view.marks.collated",
      "view.marks.this_revision",
      "view.marks.all",
      "view.marks.since_full_draft",
      "view.marks.none",
      "view.colourRevised",
    ],
  ]);
});

test("before lock the production menu holds only Lock for production", () => {
  expect([
    menuModel(
      "production",
      COMMANDS,
      serviceAt(at({ locked: false, recallOpen: false })),
    ),
    menuModel(
      "production",
      COMMANDS,
      serviceAt(at({ locked: false, recallOpen: false, canLock: false })),
    ),
  ]).toEqual([
    {
      menu: "production",
      groups: [
        [
          {
            id: "production.lock",
            label: "Lock for production…",
            enabled: true,
            checked: null,
            keys: [],
            nativeRole: null,
            submenu: null,
          },
        ],
      ],
    },
    { menu: "production", groups: [] },
  ]);
});

test("the revision marks are one submenu, its choices without its name", () => {
  const view = menuModel("view", COMMANDS, serviceAt(CTX));
  expect(
    view.groups
      .flat()
      .filter(
        (item) =>
          item.id.startsWith("view.marks.") || item.id === "view.colourRevised",
      )
      .map((item) => [item.id, item.label, item.submenu, item.enabled]),
  ).toEqual([
    ["view.marks.collated", "Collated", "Revision marks", true],
    ["view.marks.this_revision", "This revision only", "Revision marks", true],
    ["view.marks.all", "All revisions", "Revision marks", true],
    [
      "view.marks.since_full_draft",
      "Since the last full draft",
      "Revision marks",
      true,
    ],
    ["view.marks.none", "None", "Revision marks", true],
    ["view.colourRevised", "Colour revised pages", null, true],
  ]);
});

const whyNot = (id: string, context: CommandContext): string | null =>
  serviceAt(context).state(id).whyNot;

test("a command that cannot run says why", () => {
  expect([
    whyNot("production.issue", at({ waiting: 12 })),
    whyNot("production.issue", at({ waiting: 1 })),
    whyNot("production.recall", at({ waiting: 12 })),
    whyNot("production.lockAPages", at({ selection: null })),
    whyNot("production.markRevised", at({ selection: null })),
    whyNot("production.issue", at({ waiting: 12 }, { online: false })),
    whyNot("production.lock", at({ locked: false }, { online: false })),
    whyNot(
      "production.lockPages",
      at({ selection: "pages" }, { online: false }),
    ),
    whyNot("production.changeLayout", at({}, { online: false })),
    whyNot("production.unlock", at({}, { online: false })),
    whyNot("production.end", at({}, { online: false })),
  ]).toEqual([
    "needs this device's 12 waiting changes synced first",
    "needs this device's 1 waiting change synced first",
    "needs this device's 12 waiting changes synced first",
    "needs pages selected in the Pages tab",
    "needs a selection",
    "needs a connection",
    "needs a connection",
    "needs a connection",
    "needs a connection",
    "needs a connection",
    "needs a connection",
  ]);
});

const checkedAt = (context: CommandContext): [string, boolean | null][] =>
  menuModel("view", COMMANDS, serviceAt(context))
    .groups.flat()
    .filter(
      (item) =>
        item.id.startsWith("view.marks.") || item.id === "view.colourRevised",
    )
    .map((item) => [item.id, item.checked]);

test("the revision marks shown and Colour revised pages are checked", () => {
  expect([
    checkedAt(CTX),
    checkedAt(at({ mode: "this_revision", tint: true })),
  ]).toEqual([
    [
      ["view.marks.collated", true],
      ["view.marks.this_revision", false],
      ["view.marks.all", false],
      ["view.marks.since_full_draft", false],
      ["view.marks.none", false],
      ["view.colourRevised", false],
    ],
    [
      ["view.marks.collated", false],
      ["view.marks.this_revision", true],
      ["view.marks.all", false],
      ["view.marks.since_full_draft", false],
      ["view.marks.none", false],
      ["view.colourRevised", true],
    ],
  ]);
});
