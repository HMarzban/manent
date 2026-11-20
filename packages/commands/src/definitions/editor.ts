// The editor's commands: they act on the open page. Ruler, Export and Print act on the open script, for anyone who can view it.
import type { Keys, PlatformKeys } from "../chord.ts";
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition, MenuPlacement } from "../define.ts";

// the colours a page offers, as the editor names them
const TEXT_COLOURS = ["red", "orange", "green", "blue", "violet"] as const;
const HIGHLIGHT_COLOURS = [
  "yellow",
  "green",
  "pink",
  "orange",
  "violet",
] as const;

const canEdit = (ctx: CommandContext): boolean =>
  ctx.docOpen && (ctx.role === "owner" || ctx.role === "editor");
const onPages = (ctx: CommandContext): boolean =>
  ctx.docOpen && ctx.format !== "ink";
const whyNotOnPages = (ctx: CommandContext): string =>
  ctx.docOpen ? "isn't part of the Ink format" : "needs a document open";

const same = (...keys: Keys): PlatformKeys => ({
  mac: keys,
  windows: keys,
  linux: keys,
});
const inFormat = (group: string, order: number): readonly MenuPlacement[] => [
  { menu: "format", group, order, submenu: null },
];
const capitalised = (word: string): string =>
  word.charAt(0).toUpperCase() + word.slice(1);

// the zooms View ▾ → Zoom offers, percent, as the page's zoom store holds them
const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200, 300] as const;
const ZOOM_MIN = Math.min(...ZOOM_PRESETS);
const ZOOM_MAX = Math.max(...ZOOM_PRESETS);
const percent = (n: number): string => `${n}\u00a0%`;

interface ZoomLimit {
  when(ctx: CommandContext): boolean;
  whyNot(ctx: CommandContext): string;
}

/** Runs on pages while the page is drawn short of `end`; a page not drawn yet is at no end. */
const shortOf = (
  end: number,
  reached: (drawn: number) => boolean,
): ZoomLimit => ({
  when: (ctx) =>
    onPages(ctx) && (ctx.zoomPercent === null || !reached(ctx.zoomPercent)),
  whyNot: (ctx) =>
    onPages(ctx) ? `isn't available at ${percent(end)}` : whyNotOnPages(ctx),
});

/** A choice of View ▾ → Zoom, for anyone who can view a script with pages. */
function zoomCommand<const Id extends string>(
  id: Id,
  label: string,
  more: {
    order: number;
    keys?: PlatformKeys;
    limit?: ZoomLimit;
    checked?: (ctx: CommandContext) => boolean;
  },
): CommandDefinition<Id> & { readonly label: string } {
  return {
    id,
    label,
    group: "view",
    home: null,
    scope: "global",
    keys: more.keys ?? same(),
    keysFixed: false,
    when: more.limit?.when ?? onPages,
    whyNot: more.limit?.whyNot ?? whyNotOnPages,
    visible: null,
    checked: more.checked ?? null,
    passThrough: null,
    menus: [
      { menu: "view", group: "zoom", order: more.order, submenu: "Zoom" },
    ],
    palette: { keywords: [] },
    opens: null,
    reach: "self",
    setting: null,
  };
}

/** A command heard only in the page and shown only to people who can edit. */
function pageCommand<const Id extends string>(
  id: Id,
  label: string,
  more: {
    keys?: PlatformKeys;
    menus?: readonly MenuPlacement[];
    keywords?: readonly string[];
    checked?: (ctx: CommandContext) => boolean;
  } = {},
): CommandDefinition<Id> & {
  readonly scope: "editor";
  readonly label: string;
} {
  return {
    id,
    label,
    group: "format",
    home: null,
    scope: "editor",
    keys: more.keys ?? same(),
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: canEdit,
    checked: more.checked ?? null,
    passThrough: null,
    menus: more.menus ?? [],
    palette: { keywords: more.keywords ?? [] },
    opens: null,
    reach: "self",
    setting: null,
  };
}

export const EDITOR_COMMANDS = defineCommands([
  pageCommand("format.element", "Element", {
    keys: same("Alt+Enter"),
    menus: inFormat("element", 10),
    keywords: ["block type", "line type"],
  }),
  pageCommand("element.sceneHeading", "Scene Heading", {
    keys: same("Mod+1"),
    keywords: ["slugline"],
  }),
  pageCommand("element.action", "Action", { keys: same("Mod+2") }),
  pageCommand("element.character", "Character", { keys: same("Mod+3") }),
  pageCommand("element.parenthetical", "Parenthetical", {
    keys: same("Mod+4"),
  }),
  pageCommand("element.dialogue", "Dialogue", { keys: same("Mod+5") }),
  pageCommand("element.transition", "Transition", { keys: same("Mod+6") }),
  pageCommand("element.shot", "Shot", { keys: same("Mod+7") }),
  pageCommand("element.section", "Section", { keys: same("Mod+8") }),
  pageCommand("element.newAct", "New Act", { keys: same("Mod+9") }),
  // Mod+0 is Zoom: Fit width's, and on the web the browser's
  pageCommand("element.general", "General"),
  pageCommand("element.endOfAct", "End of Act"),
  pageCommand("element.emote", "Emote"),
  pageCommand("element.camera", "Camera"),
  pageCommand("element.engineDirection", "Engine Direction"),
  pageCommand("format.dualDialogue", "Dual dialogue", {
    keys: same("Mod+D"),
    menus: inFormat("speech", 10),
  }),
  pageCommand("format.pageBreak", "Page break", {
    keys: same("Mod+Enter"),
    menus: inFormat("break", 10),
  }),
  pageCommand("format.bold", "Bold", {
    keys: same("Mod+B"),
    menus: inFormat("styles", 10),
  }),
  pageCommand("format.italic", "Italic", {
    keys: same("Mod+I"),
    menus: inFormat("styles", 20),
  }),
  pageCommand("format.underline", "Underline", {
    keys: same("Mod+U"),
    menus: inFormat("styles", 30),
  }),
  pageCommand("format.strike", "Strikethrough", {
    menus: inFormat("styles", 40),
  }),
  pageCommand("format.caps", "All-caps", { menus: inFormat("styles", 50) }),
  pageCommand("format.alignLeft", "Align left", {
    menus: inFormat("align", 10),
  }),
  pageCommand("format.alignCenter", "Align centre", {
    menus: inFormat("align", 20),
  }),
  pageCommand("format.alignRight", "Align right", {
    menus: inFormat("align", 30),
  }),
  pageCommand("format.spaceBefore", "Space before", {
    menus: inFormat("align", 40),
    checked: (ctx) => ctx.spaceBeforeSet,
  }),
  pageCommand("format.colour.none", "Text colour: None"),
  ...TEXT_COLOURS.map((colour) =>
    pageCommand(
      `format.colour.${colour}`,
      `Text colour: ${capitalised(colour)}`,
    ),
  ),
  pageCommand("format.highlight.none", "Highlight: None"),
  ...HIGHLIGHT_COLOURS.map((colour) =>
    pageCommand(
      `format.highlight.${colour}`,
      `Highlight: ${capitalised(colour)}`,
    ),
  ),
  {
    id: "view.ruler",
    label: "Ruler",
    group: "view",
    home: null,
    scope: "global",
    keys: same(),
    keysFixed: false,
    when: onPages,
    whyNot: whyNotOnPages,
    visible: null,
    checked: (ctx) => ctx.rulerShown,
    passThrough: null,
    menus: [{ menu: "view", group: "page", order: 10, submenu: null }],
    palette: { keywords: [] },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "doc.export",
    label: "Export…",
    group: "file",
    home: null,
    scope: "global",
    keys: same(),
    keysFixed: false,
    when: onPages,
    whyNot: whyNotOnPages,
    visible: null,
    checked: null,
    passThrough: null,
    menus: [
      { menu: "title", group: "send", order: 20, submenu: null },
      { menu: "file", group: "send", order: 10, submenu: null },
    ],
    palette: { keywords: ["pdf", "download", "save as"] },
    opens: { surface: "send", focus: "first" },
    reach: "self",
    setting: null,
  },
  {
    id: "doc.print",
    label: "Print…",
    group: "file",
    home: null,
    scope: "global",
    keys: same("Mod+P"),
    keysFixed: false,
    when: onPages,
    whyNot: whyNotOnPages,
    visible: null,
    checked: null,
    passThrough: null,
    menus: [
      { menu: "title", group: "send", order: 30, submenu: null },
      { menu: "file", group: "send", order: 20, submenu: null },
    ],
    palette: { keywords: [] },
    opens: { surface: "send", focus: "first" },
    reach: "self",
    setting: null,
  },
  zoomCommand("view.zoomIn", "Zoom in", {
    order: 90,
    keys: same("Mod+="),
    limit: shortOf(ZOOM_MAX, (drawn) => drawn >= ZOOM_MAX),
  }),
  zoomCommand("view.zoomOut", "Zoom out", {
    order: 100,
    keys: same("Mod+-"),
    limit: shortOf(ZOOM_MIN, (drawn) => drawn <= ZOOM_MIN),
  }),
  zoomCommand("view.zoomFitWidth", "Zoom: Fit width", {
    order: 10,
    keys: same("Mod+0"),
    checked: (ctx) => ctx.zoom === "fit_width",
  }),
  ...ZOOM_PRESETS.map((n, at) =>
    zoomCommand(`view.zoom${n}`, `Zoom: ${percent(n)}`, {
      order: 20 + 10 * at,
      checked: (ctx) => ctx.zoom === n,
    }),
  ),
]);
export type EditorCommandId = (typeof EDITOR_COMMANDS)[number]["id"];
