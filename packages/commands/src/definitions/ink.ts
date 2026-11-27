// Commands for the interactive player Beside on Ink and Game Scripts: Play, Play from here, Back, and Restart.
import type { Chord, PlatformKeys } from "../chord.ts";
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";

const same = (...keys: Chord[]): PlatformKeys =>
  Object.freeze({ mac: keys, windows: keys, linux: keys });

const NO_KEYS = same();

const isPlayableOpen = (ctx: CommandContext): boolean =>
  ctx.docOpen && (ctx.format === "ink" || ctx.format === "game");

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
    visible: isPlayableOpen,
    checked: null,
    passThrough: null,
    menus: [{ menu: "title", group: "play", order: 10, submenu: null }],
    palette: { keywords: ["ink", "game", "player", "playtest", "run"] },
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
    visible: isPlayableOpen,
    checked: null,
    passThrough: null,
    menus: [{ menu: "title", group: "play", order: 20, submenu: null }],
    palette: { keywords: ["ink", "game", "knot", "scene", "player"] },
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
    visible: isPlayableOpen,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: ["ink", "game", "player"] },
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
    visible: isPlayableOpen,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: ["ink", "game", "player"] },
    opens: null,
    reach: "self",
    setting: null,
  },
]);
