// The script's layout settings: the lines on a page, how scene numbers are shown and the layout engine.
import { setting } from "../define.ts";
import { t } from "../types.ts";

export const SCRIPT_LAYOUT_SETTINGS = Object.freeze([
  setting({
    key: "script.engineVersion",
    scope: "script",
    type: t.number({ min: 1, max: 999, step: 1 }),
    default: 1,
    label: "Layout engine",
    description: null,
    noun: "layout engine",
    surfaces: [{ in: "scriptSettings", group: "layout_engine", order: 10 }],
    apply: { how: "editor", effect: "layout" },
    boot: false,
    guard: "layout",
    keywords: [],
  }),
] as const);
