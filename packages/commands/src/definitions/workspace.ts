// Commands for Workspace settings.
import { defineCommands } from "../define.ts";

export const WORKSPACE_COMMANDS = defineCommands([
  {
    id: "workspace.settings",
    label: "Workspace settings",
    group: "title",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: (ctx) => ctx.signedIn,
    whyNot: () => "needs you signed in",
    visible: (ctx) => ctx.signedIn,
    checked: null,
    passThrough: null,
    menus: [],
    palette: {
      keywords: [
        "workspace",
        "settings",
        "people",
        "notifications",
        "api",
        "broadcast",
        "mos",
        "prompter",
        "webhook",
        "slack",
      ],
    },
    opens: { surface: "workspace_settings", focus: "heading" },
    reach: "self",
    setting: null,
  },
]);
