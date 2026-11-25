// The command that opens a second document beside the first.
import { defineCommands } from "../define.ts";

export const BESIDE_COMMANDS = defineCommands([
  {
    id: "doc.openBeside",
    label: "Open beside",
    group: "title",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) => ctx.docOpen,
    checked: null,
    passThrough: null,
    // after Name this draft… and Drafts in Title ▾
    menus: [{ menu: "title", group: "drafts", order: 30, submenu: null }],
    palette: { keywords: [] },
    opens: { surface: "beside", focus: "first" },
    reach: "self",
    setting: null,
  },
]);
