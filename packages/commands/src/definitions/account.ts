// Commands for Account and sign-out.
import { defineCommands } from "../define.ts";

export const ACCOUNT_COMMANDS = defineCommands([
  {
    id: "app.signOut",
    label: "Sign out",
    group: "person",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: (ctx) => ctx.signedIn,
    checked: null,
    passThrough: null,
    menus: [{ menu: "person", group: "person", order: 30, submenu: null }],
    palette: { keywords: [] },
    opens: null,
    reach: "self",
    setting: null,
  },
]);
