// Timing commands: excluding a selection from the Variety read-rate clock and including it again.
import type { PlatformKeys } from "../chord.ts";
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition } from "../define.ts";

const NO_KEYS: PlatformKeys = Object.freeze({
  mac: [],
  windows: [],
  linux: [],
});

const canTime = (ctx: CommandContext): boolean =>
  ctx.docOpen &&
  ctx.format === "variety" &&
  (ctx.role === "owner" || ctx.role === "editor");

function timingCommand<const Id extends string>(
  id: Id,
  label: string,
): CommandDefinition<Id> {
  return {
    id,
    label,
    group: "script",
    home: null,
    scope: "editor",
    keys: NO_KEYS,
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: canTime,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: ["timing"] },
    opens: null,
    reach: "others",
    setting: null,
  };
}

export const TIMING_COMMANDS = defineCommands([
  timingCommand("timing.exclude", "Exclude from timing"),
  timingCommand("timing.include", "Include in timing"),
]);
