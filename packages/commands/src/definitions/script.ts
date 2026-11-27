// Commands on the Script menu for writing tools (Rename character, Read aloud, goals, and names).
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";

const editableScript = (ctx: CommandContext): boolean =>
  ctx.docOpen &&
  ctx.docKind === "script" &&
  ctx.format !== "ink" &&
  (ctx.role === "owner" || ctx.role === "editor");

const whyNotEditableScript = (ctx: CommandContext): string => {
  if (!ctx.docOpen) return "needs a document open";
  if (ctx.docKind !== "script") return "works on a script";
  if (ctx.format === "ink") return "isn't part of the Ink format";
  return "needs edit access";
};

const canReadAloud = (ctx: CommandContext): boolean =>
  ((ctx.docOpen && ctx.docKind === "script" && ctx.format !== "ink") ||
    ctx.screen === "reader") &&
  !ctx.readingAloud;

const whyNotReadAloud = (ctx: CommandContext): string => {
  if (ctx.readingAloud) return "is already running";
  if (!ctx.docOpen) return "needs a document open";
  if (ctx.docKind !== "script") return "works on a script";
  return "isn't part of the Ink format";
};

const onPagedScript = (ctx: CommandContext): boolean =>
  ctx.docOpen && ctx.docKind === "script" && ctx.format !== "ink";

const whyNotPagedScript = (ctx: CommandContext): string => {
  if (!ctx.docOpen) return "needs a document open";
  if (ctx.docKind !== "script") return "works on a script";
  return "isn't part of the Ink format";
};

const canStartSprint = (ctx: CommandContext): boolean =>
  onPagedScript(ctx) && !ctx.sprintRunning;

const whyNotStartSprint = (ctx: CommandContext): string =>
  ctx.sprintRunning
    ? "isn't available while a sprint is on"
    : whyNotPagedScript(ctx);

export const SCRIPT_COMMANDS = defineCommands([
  {
    id: "script.renameCharacter",
    label: "Rename character",
    group: "script",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: editableScript,
    whyNot: whyNotEditableScript,
    visible: onPagedScript,
    checked: null,
    passThrough: null,
    menus: [
      { menu: "script", group: "script", order: 10, submenu: null },
      { menu: "title", group: "tools", order: 10, submenu: "Tools" },
    ],
    palette: { keywords: ["character", "cue", "replace"] },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "readAloud.start",
    label: "Read aloud",
    group: "script",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: canReadAloud,
    whyNot: whyNotReadAloud,
    visible: (ctx) => onPagedScript(ctx) || ctx.screen === "reader",
    checked: null,
    passThrough: null,
    menus: [
      { menu: "script", group: "script", order: 90, submenu: null },
      { menu: "title", group: "tools", order: 20, submenu: "Tools" },
    ],
    palette: { keywords: ["speech", "tts", "speak", "voice"] },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "readAloud.stop",
    label: "Stop",
    group: "script",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: (ctx) => ctx.readingAloud,
    whyNot: () => "isn't running",
    visible: (ctx) => ctx.readingAloud,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { hidden: "the state bar's action" },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "script.goal",
    label: "Goal",
    group: "script",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: onPagedScript,
    whyNot: whyNotPagedScript,
    visible: null,
    checked: null,
    passThrough: null,
    menus: [{ menu: "script", group: "script", order: 50, submenu: null }],
    palette: {
      keywords: ["writing goal", "daily", "target", "pages", "words"],
    },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "sprint.start",
    label: "Start sprint",
    group: "script",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: canStartSprint,
    whyNot: whyNotStartSprint,
    visible: null,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: ["timer", "writing sprint", "countdown", "minutes"] },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "sprint.end",
    label: "End",
    group: "script",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: (ctx) => ctx.sprintRunning,
    whyNot: () => "isn't running",
    visible: (ctx) => ctx.sprintRunning,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { hidden: "the state bar's action" },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "script.numbers",
    label: "Numbers",
    group: "script",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: onPagedScript,
    whyNot: whyNotPagedScript,
    visible: null,
    checked: null,
    passThrough: null,
    menus: [{ menu: "script", group: "script", order: 70, submenu: null }],
    palette: {
      keywords: [
        "counts",
        "pages",
        "scenes",
        "runtime",
        "characters",
        "dialogue",
      ],
    },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "script.reports",
    label: "Reports…",
    group: "script",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: onPagedScript,
    whyNot: whyNotPagedScript,
    visible: onPagedScript,
    checked: null,
    passThrough: null,
    menus: [
      { menu: "script", group: "script", order: 80, submenu: null },
      { menu: "title", group: "tools", order: 30, submenu: "Tools" },
    ],
    palette: {
      keywords: [
        "character report",
        "scene report",
        "location report",
        "csv",
        "pdf",
        "breakdown",
        "pickup lines",
      ],
    },
    opens: { surface: "send", focus: "first" },
    reach: "self",
    setting: null,
  },
]);
