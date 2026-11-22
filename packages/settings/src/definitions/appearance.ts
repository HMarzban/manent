// The two Appearance preferences, both applied before the first paint.
import { setting } from "../define.ts";
import { t } from "../types.ts";

export const APPEARANCE_SETTINGS = Object.freeze([
  setting({
    key: "appearance.theme",
    scope: "personal",
    type: t.choice([
      { value: "system", label: "System" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ]),
    default: "system" as const,
    label: "Theme",
    description: null,
    noun: null,
    surfaces: [
      { in: "preferences", section: "appearance", order: 10 },
      { in: "menu", menu: "view", group: "theme", order: 10, submenu: "Theme" },
      { in: "palette" },
    ],
    apply: {
      how: "attribute",
      name: "data-theme",
      values: { system: null, light: "light", dark: "dark" },
    },
    boot: true,
    guard: null,
    keywords: ["night mode"],
  }),
  setting({
    key: "appearance.whitePage",
    scope: "personal",
    type: t.boolean(),
    default: false,
    label: "White page in dark theme",
    description: null,
    noun: null,
    surfaces: [
      { in: "preferences", section: "appearance", order: 20 },
      { in: "menu", menu: "view", group: "theme", order: 20, submenu: "Theme" },
      { in: "palette" },
    ],
    apply: {
      how: "attribute",
      name: "data-white-page",
      values: { true: "", false: null },
    },
    boot: true,
    guard: null,
    keywords: [],
  }),
] as const);
