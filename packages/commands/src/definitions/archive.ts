// Export… on a project's row menu in the Library: Send titled Export, with As set to the project's archive.
import { defineCommands } from "../define.ts";

export const ARCHIVE_COMMANDS = defineCommands([
  {
    id: "library.exportProject",
    label: "Export…",
    group: "file",
    home: null,
    scope: "global",
    keys: { mac: [], windows: [], linux: [] },
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: null,
    checked: null,
    passThrough: null,
    menus: [],
    palette: { hidden: "an item of a project's row menu in the Library" },
    opens: { surface: "send", focus: "first" },
    reach: "self",
    setting: null,
  },
]);
