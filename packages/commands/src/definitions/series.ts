import { defineCommands } from "../define.ts";

export const SERIES_COMMANDS = defineCommands([
  {
    id: "series.openBoard",
    label: "Board",
    group: "script",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) =>
      ctx.docOpen && ctx.projectKind === "series" && ctx.screen !== "board",
    checked: null,
    passThrough: null,
    menus: [],
    palette: {
      keywords: ["board", "series", "episodes", "storylines", "cards"],
    },
    opens: null,
    reach: "self",
    setting: null,
  },
]);
