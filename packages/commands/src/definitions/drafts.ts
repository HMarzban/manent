// Commands for sending a draft to read and copying a sent draft's link.
import type { CommandContext } from "../context.ts";
import { defineCommands } from "../define.ts";

const canSendDraft = (ctx: CommandContext): boolean =>
  ctx.docOpen &&
  ctx.docKind === "script" &&
  ctx.format !== "ink" &&
  (ctx.role === "owner" || ctx.role === "editor");

export const DRAFTS_COMMANDS = defineCommands([
  {
    id: "draft.send",
    label: "Send draft…",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: (ctx) => ctx.online,
    whyNot: () => "needs a connection",
    visible: canSendDraft,
    checked: null,
    passThrough: null,
    menus: [
      { menu: "title", group: "send", order: 40, submenu: null },
      { menu: "file", group: "send", order: 30, submenu: null },
    ],
    palette: { keywords: ["share", "readers", "draft", "pdf"] },
    opens: { surface: "send", focus: "first" },
    reach: "self",
    setting: null,
  },
  {
    id: "draft.copyLink",
    label: "Copy draft link",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: canSendDraft,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { hidden: "the action of the message after Send draft" },
    opens: null,
    reach: "self",
    setting: null,
  },
]);
