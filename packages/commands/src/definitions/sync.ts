// The commands of syncing and of To review.
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition } from "../define.ts";

const onDocument = (ctx: CommandContext): boolean => ctx.docOpen;

/** A command no menu or key reaches: only the control or message named by `reachedBy`. */
function reachedOnly<const Id extends string>(
  id: Id,
  label: string,
  group: CommandDefinition["group"],
  reachedBy: string,
): CommandDefinition<Id> & { readonly label: string } {
  return {
    id,
    label,
    group,
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
    palette: { hidden: reachedBy },
    opens: null,
    reach: "self",
    setting: null,
  };
}

export const SYNC_COMMANDS = defineCommands([
  reachedOnly("history.review", "Review", "file", "the message's action"),
  reachedOnly(
    "review.undo",
    "Undo",
    "edit",
    "the reverse a message offers for Keep as merged",
  ),
]);
