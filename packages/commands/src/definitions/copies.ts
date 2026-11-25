// Duplicate: the open script, or the version chosen in History, becomes a separate script; opening the last copy
// beside the page; and starting a film, episode or stage play from the open script or book.
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";

const START_FROM_SUBMENU = "Start a … from this…";
const START_FROM_OPENS = { surface: "beside", focus: "stay" } as const;

const isScriptOf = (
  ctx: CommandContext,
  kinds: readonly NonNullable<CommandContext["projectKind"]>[],
): boolean =>
  ctx.docOpen &&
  ctx.docKind === "script" &&
  ctx.projectKind !== null &&
  kinds.includes(ctx.projectKind);

const startFromMenus = (titleOrder: number, fileOrder: number) =>
  [
    // after Drafts and Open beside in Title ▾, and after Import… in File
    {
      menu: "title",
      group: "drafts",
      order: titleOrder,
      submenu: START_FROM_SUBMENU,
    },
    {
      menu: "file",
      group: "new",
      order: fileOrder,
      submenu: START_FROM_SUBMENU,
    },
  ] as const;

export const COPIES_COMMANDS = defineCommands([
  {
    id: "doc.duplicate",
    label: "Duplicate",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) => ctx.docOpen && ctx.docKind === "script",
    checked: null,
    passThrough: null,
    // after Print… in Title ▾, and after History in File
    menus: [
      { menu: "title", group: "send", order: 40, submenu: null },
      { menu: "file", group: "history", order: 40, submenu: null },
    ],
    palette: { keywords: ["copy"] },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "doc.duplicateVersion",
    label: "Duplicate",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    // a version this device does not hold is read from the server
    when: (ctx) => ctx.online,
    whyNot: () => "needs a connection",
    visible: (ctx) => ctx.docOpen && ctx.docKind === "script",
    checked: null,
    passThrough: null,
    menus: [],
    palette: { hidden: "an item of a version's row in History" },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "copy.openCopyBeside",
    label: "Open beside",
    group: "file",
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
    palette: {
      hidden:
        "the action of the message that says a copy's page numbers were locked",
    },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "copy.startFilm",
    label: "Start a film from this…",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) => isScriptOf(ctx, ["series", "stage_play", "book"]),
    checked: null,
    passThrough: null,
    menus: startFromMenus(40, 50),
    palette: { keywords: ["film", "start from", "copy"] },
    opens: START_FROM_OPENS,
    reach: "self",
    setting: null,
  },
  {
    id: "copy.startEpisode",
    label: "Start an episode from this…",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) => isScriptOf(ctx, ["film", "stage_play"]),
    checked: null,
    passThrough: null,
    menus: startFromMenus(41, 51),
    palette: { keywords: ["episode", "series", "start from", "copy"] },
    opens: START_FROM_OPENS,
    reach: "self",
    setting: null,
  },
  {
    id: "copy.startStagePlay",
    label: "Start a stage play from this…",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) => isScriptOf(ctx, ["film", "series", "book"]),
    checked: null,
    passThrough: null,
    menus: startFromMenus(42, 52),
    palette: { keywords: ["stage play", "play", "start from", "copy"] },
    opens: START_FROM_OPENS,
    reach: "self",
    setting: null,
  },
]);
