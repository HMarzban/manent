// The commands of working in one room: following another person's caret, presenting to the room, and taking keys.
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition } from "../define.ts";

const onDocument = (ctx: CommandContext): boolean => ctx.docOpen;
const canEditScript = (ctx: CommandContext): boolean =>
  ctx.docOpen &&
  ctx.docKind === "script" &&
  (ctx.role === "owner" || ctx.role === "editor");

/** A command of an open document with no key, menu or palette entry: it is offered where its object is. */
function roomCommand<const Id extends string>(
  id: Id,
  label: string,
  hidden: string,
): CommandDefinition<Id> & { readonly label: string } {
  return {
    id,
    label,
    group: "view",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: onDocument,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { hidden },
    opens: null,
    reach: "self",
    setting: null,
  };
}

export const ROOM_COMMANDS = defineCommands([
  roomCommand("room.follow", "Follow", "the people list's action"),
  roomCommand("room.stopFollowing", "Stop", "the state bar's action"),
  {
    id: "room.takeKeys",
    label: "Take keys",
    group: "view",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: (ctx) =>
      ctx.online &&
      (ctx.driver === undefined ||
        (ctx.driver !== null && ctx.driver.active && !ctx.driver.isSelf)),
    whyNot: (ctx) => {
      if (!ctx.online) return "needs a connection";
      if (ctx.driver?.isSelf === true)
        return "works when someone else is driving";
      return "needs someone presenting to the room";
    },
    visible: canEditScript,
    checked: null,
    passThrough: null,
    menus: [{ menu: "view", group: "people", order: 22, submenu: null }],
    palette: { keywords: ["room", "drive", "present"] },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "room.pitch",
    label: "Pitch…",
    group: "view",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: (ctx) => {
      if (!ctx.online) return false;
      if (ctx.driver === undefined) return true;
      if (ctx.driver === null || !ctx.driver.active || ctx.driver.isSelf)
        return false;
      if (ctx.driver.caretInSpeech !== undefined)
        return ctx.driver.caretInSpeech;
      return ctx.material === null || ctx.material.caretInSpeech;
    },
    whyNot: (ctx) => {
      if (!ctx.online) return "needs a connection";
      if (ctx.driver === null || ctx.driver?.active === false)
        return "needs someone driving";
      if (ctx.driver?.isSelf === true)
        return "works when someone else is driving";
      const name = ctx.driver?.name;
      return name
        ? `needs ${name}'s caret in a speech`
        : "needs the driver's caret in a speech";
    },
    visible: canEditScript,
    checked: null,
    passThrough: null,
    menus: [{ menu: "view", group: "people", order: 24, submenu: null }],
    palette: { keywords: ["room", "suggest", "line"] },
    opens: { surface: "pitch_field", focus: "first" },
    reach: "self",
    setting: null,
  },
  {
    id: "view.presentToRoom",
    label: "Present to the room",
    group: "view",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) => ctx.docOpen && ctx.docKind === "script",
    checked: null,
    passThrough: null,
    menus: [{ menu: "view", group: "people", order: 20, submenu: null }],
    palette: { keywords: [] },
    opens: null,
    reach: "self",
    setting: null,
  },
]);
