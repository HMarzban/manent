// Moving the focused scene of the Scenes tab, a row or a card, one place up or down.
import { defineCommands } from "../define.ts";
import type { CommandDefinition } from "../define.ts";

// heard only in the left panel, where the Scenes tab listens for it; the handler says why when no scene is focused
const moveCommand = <const Id extends string>(
  id: Id,
  label: string,
  chord: string,
): CommandDefinition<Id> & { readonly label: string } => ({
  id,
  label,
  group: "script",
  home: null,
  scope: "surface:left_panel",
  keys: { mac: [chord], windows: [chord], linux: [chord] },
  keysFixed: false,
  when: null,
  whyNot: null,
  visible: (ctx) =>
    ctx.docOpen && (ctx.role === "owner" || ctx.role === "editor"),
  checked: null,
  passThrough: null,
  menus: [],
  palette: { keywords: [] },
  opens: null,
  reach: "self",
  setting: null,
});

export const SCENES_COMMANDS = defineCommands([
  moveCommand("scene.moveUp", "Move scene up", "Alt+ArrowUp"),
  moveCommand("scene.moveDown", "Move scene down", "Alt+ArrowDown"),
]);
