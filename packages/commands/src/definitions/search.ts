// Library search command: focuses the workspace search field in the Library.
import { defineCommands } from "../define.ts";

export const SEARCH_COMMANDS = defineCommands([
  {
    id: "library.search",
    label: "Search this workspace",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: (ctx) => ctx.screen === "library",
    whyNot: () => "works in the Library",
    visible: (ctx) => ctx.screen === "library",
    checked: null,
    passThrough: null,
    menus: [],
    palette: { keywords: [] },
    opens: null,
    reach: "self",
    setting: null,
  },
]);
