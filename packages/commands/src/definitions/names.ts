// The project's names at the caret: writing a near match's listed spelling, and adding a word to the names. Each says
// why in the message slot when the caret is not where it acts, since the context does not hold the caret.
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";

const canEdit = (ctx: CommandContext): boolean =>
  ctx.docOpen && (ctx.role === "owner" || ctx.role === "editor");

const NO_KEYS = Object.freeze({ mac: [], windows: [], linux: [] });

export const NAMES_COMMANDS = defineCommands([
  {
    id: "name.useListed",
    label: "Use the project's spelling",
    group: "edit",
    home: null,
    scope: "global",
    keys: NO_KEYS,
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: canEdit,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: [] },
    opens: null,
    reach: "self",
    setting: null,
  },
  {
    id: "name.addToProject",
    label: "Add to names",
    group: "edit",
    home: null,
    scope: "global",
    keys: NO_KEYS,
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: canEdit,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: [] },
    opens: { surface: "name_offer", focus: "stay" },
    reach: "self",
    setting: null,
  },
]);
