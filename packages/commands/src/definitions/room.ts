// The commands of working in one room: following another person's caret.
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition } from "../define.ts";

const onDocument = (ctx: CommandContext): boolean => ctx.docOpen;

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
]);
