// Commands for the Ink player Beside: Play, Play from here, Back, and Restart.
import type { Chord, PlatformKeys } from "../chord.ts";
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";

const same = (...keys: Chord[]): PlatformKeys =>
  Object.freeze({ mac: keys, windows: keys, linux: keys });

const NO_KEYS = same();

const isInkOpen = (ctx: CommandContext): boolean =>
  ctx.docOpen && ctx.format === "ink";

const BESIDE = Object.freeze({ surface: "beside", focus: "first" } as const);

export const INK_COMMANDS = defineCommands([
  {
    id: "ink.play",
    label: "Play",
    group: "title",
    home: null,
    scope: "global",
    keys: NO_KEYS,
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: isInkOpen,
    checked: null,
    passThrough: null,
    menus: [{ menu: "title", group: "play", order: 10, submenu: null }],
    palette: { keywords: ["ink", "player", "run"] },
    opens: BESIDE,
    reach: "self",
    setting: null,
  },
  {
    id: "ink.playFromHere",
    label: "Play from here",
    group: "title",
    home: null,
    scope: "global",
    keys: NO_KEYS,
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: isInkOpen,
    checked: null,
    passThrough: null,
    menus: [{ menu: "title", group: "play", order: 20, submenu: null }],
    palette: { keywords: ["ink", "knot", "player"] },
    opens: BESIDE,
    reach: "self",
    setting: null,
  },
  {
    id: "ink.back",
    label: "Back",
    group: "title",
    home: null,
    scope: "global",
    keys: NO_KEYS,
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: isInkOpen,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: ["ink", "player"] },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "ink.restart",
    label: "Restart",
    group: "title",
    home: null,
    scope: "global",
    keys: NO_KEYS,
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: isInkOpen,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: ["ink", "player"] },
    opens: null,
    reach: "self",
    setting: null,
  },
]);
