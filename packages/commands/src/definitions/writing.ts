// The commands of the Writing switch: who sees what the person types in a script, and handing private work in.
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition, MenuPlacement } from "../define.ts";

type Position = NonNullable<CommandContext["writing"]>["position"];

const NO_KEYS = Object.freeze({ mac: [], windows: [], linux: [] });

const isAt = (ctx: CommandContext, position: Position): boolean =>
  ctx.writing?.position === position;

const onScript = (ctx: CommandContext): boolean => ctx.writing !== null;

const isLocked = (ctx: CommandContext): boolean =>
  ctx.production?.locked === true;

const inSubmenu = (order: number): MenuPlacement => ({
  menu: "edit",
  group: "writing",
  order,
  submenu: "Writing",
});

/** A command of an open script, shown there unless `more.visible` narrows it, with no key and no menu unless given. */
function writingCommand<const Id extends string>(
  id: Id,
  label: string,
  more: Partial<
    Pick<
      CommandDefinition,
      "when" | "whyNot" | "visible" | "checked" | "menus" | "palette" | "opens"
    >
  >,
): CommandDefinition<Id> & { readonly label: string } {
  return {
    id,
    label,
    group: "edit",
    home: null,
    scope: "global",
    keys: NO_KEYS,
    keysFixed: false,
    when: more.when ?? null,
    whyNot: more.whyNot ?? null,
    visible: more.visible ?? onScript,
    checked: more.checked ?? null,
    passThrough: null,
    menus: more.menus ?? [],
    palette: more.palette ?? { keywords: [] },
    opens: more.opens ?? null,
    reach: "self",
    setting: null,
  };
}

export const WRITING_COMMANDS = defineCommands([
  writingCommand("writing.forEveryone", "Writing: For everyone", {
    checked: (ctx) => isAt(ctx, "everyone"),
    menus: [inSubmenu(10)],
  }),
  // absent once page numbers are locked: suggestions and revisions never mix
  writingCommand("writing.asSuggestions", "Writing: As suggestions", {
    visible: (ctx) => onScript(ctx) && !isLocked(ctx),
    checked: (ctx) => isAt(ctx, "suggestions"),
    menus: [inSubmenu(20)],
    palette: { keywords: ["suggest"] },
  }),
  writingCommand("writing.privately", "Writing: Privately", {
    when: (ctx) => ctx.online,
    whyNot: () => "needs a connection",
    checked: (ctx) => isAt(ctx, "private"),
    menus: [inSubmenu(30)],
    palette: { keywords: ["my draft"] },
  }),
  writingCommand("writing.stopSuggestions", "Stop", {
    visible: (ctx) => isAt(ctx, "suggestions"),
    palette: { hidden: "the state bar's action" },
  }),
  writingCommand("writing.handIn", "Hand in…", {
    visible: (ctx) => isAt(ctx, "private"),
    opens: { surface: "side_panel", focus: "item" },
  }),
  writingCommand("writing.restoreBeforeHandIn", "Restore 'Before hand-in'", {
    palette: { hidden: "the action of the message after Hand in" },
  }),
  writingCommand("writing.seeHandedIn", "See what changed", {
    palette: { hidden: "the action of the message after someone hands in" },
  }),
]);
