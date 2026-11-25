// Commands for production outputs: sending selected scenes to Export → Sides.
import type { Chord, PlatformKeys } from "../chord.ts";
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";
import type { CommandDefinition, MenuPlacement } from "../define.ts";

type Production = NonNullable<CommandContext["production"]>;

const same = (...keys: Chord[]): PlatformKeys =>
  Object.freeze({ mac: keys, windows: keys, linux: keys });

const NO_KEYS = same();

function productionCommand<const Id extends string>(
  id: Id,
  label: CommandDefinition["label"],
  more: {
    shown: (p: Production) => boolean;
    menus?: readonly MenuPlacement[];
    palette?: CommandDefinition["palette"];
    opens?: CommandDefinition["opens"];
  },
): CommandDefinition<Id> {
  return {
    id,
    label,
    group: more.menus?.[0]?.menu ?? "production",
    home: null,
    scope: "editor",
    keys: NO_KEYS,
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) =>
      ctx.format !== "ink" &&
      ctx.production !== null &&
      more.shown(ctx.production),
    checked: null,
    passThrough: null,
    menus: more.menus ?? [],
    palette: more.palette ?? { keywords: [] },
    opens: more.opens ?? null,
    reach: "self",
    setting: null,
  };
}

export const PRODUCTION_OUTPUTS_COMMANDS = defineCommands([
  productionCommand("production.includeInSides", "Include in sides…", {
    shown: (p) => p.locked && p.selection === "scene",
    menus: [{ menu: "production", group: "scenes", order: 20, submenu: null }],
    palette: { keywords: ["sides"] },
    opens: { surface: "send", focus: "first" },
  }),
]);
