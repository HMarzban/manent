// The commands of writers' material: a speech's alternates and moving a selection to cuts.
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition } from "../define.ts";

// writers' material is for those who write the script
const canWrite = (ctx: CommandContext): boolean =>
  ctx.material !== null && (ctx.role === "owner" || ctx.role === "editor");

function alternatesCommand<const Id extends string>(
  id: Id,
  label: string,
  more: Pick<CommandDefinition, "keys" | "menus" | "opens">,
): CommandDefinition<Id> {
  return {
    id,
    label,
    group: "script",
    home: null,
    scope: "editor",
    keysFixed: false,
    when: (ctx) => ctx.material?.caretInSpeech === true,
    whyNot: () => "needs the caret in a speech",
    visible: canWrite,
    checked: null,
    passThrough: null,
    palette: { keywords: [] },
    reach: "self",
    setting: null,
    ...more,
  };
}

export const MATERIAL_COMMANDS = defineCommands([
  alternatesCommand("alternate.show", "Alternates", {
    keys: {
      mac: ["Mod+Shift+A"],
      windows: ["Mod+Shift+A"],
      linux: ["Mod+Shift+A"],
    },
    menus: [{ menu: "script", group: "material", order: 10, submenu: null }],
    opens: { surface: "alternates_popover", focus: "first" },
  }),
  // the selection toolbar's item in a speech: the popover opens with its field focused
  alternatesCommand("alternate.add", "Add alternate", {
    keys: { mac: [], windows: [], linux: [] },
    menus: [],
    opens: { surface: "alternates_popover", focus: "item" },
  }),
  {
    id: "material.moveToCuts",
    label: "Move to cuts",
    group: "script",
    home: null,
    scope: "editor",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: (ctx) => ctx.material?.selection === true,
    whyNot: () => "needs a selection",
    visible: canWrite,
    checked: null,
    passThrough: null,
    menus: [{ menu: "script", group: "material", order: 20, submenu: null }],
    palette: { keywords: ["cut", "cuts"] },
    opens: null,
    reach: "self",
    setting: null,
  },
]);
