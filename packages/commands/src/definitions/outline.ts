// Outline document commands: turning an outline's beats into scene headings with synopses in an empty script.
import { defineCommands } from "../define.ts";

const OUTLINE_PROJECT_KINDS = new Set(["series", "film", "stage_play"]);

export const OUTLINE_COMMANDS = defineCommands([
  {
    id: "outline.startScript",
    label: "Start script from outline",
    group: "title",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: (ctx) => ctx.outlineStart,
    whyNot: () => "needs an empty script whose outline has beats",
    visible: (ctx) =>
      ctx.docOpen &&
      ctx.docKind === "script" &&
      (ctx.role === "owner" || ctx.role === "editor") &&
      (ctx.projectKind === null || OUTLINE_PROJECT_KINDS.has(ctx.projectKind)),
    checked: null,
    passThrough: null,
    // after Open beside in Title ▾
    menus: [{ menu: "title", group: "drafts", order: 40, submenu: null }],
    palette: { keywords: ["beats", "headings", "synopsis"] },
    opens: null,
    reach: "self",
    setting: null,
  },
]);
