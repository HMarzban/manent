// The five Writing preferences.
import { setting } from "../define.ts";
import { t } from "../types.ts";

export const WRITING_SETTINGS = Object.freeze([
  setting({
    key: "writing.enterAfterDialogue",
    scope: "personal",
    type: t.choice([
      { value: "action", label: "Action" },
      { value: "character", label: "Character" },
    ]),
    default: "action" as const,
    label: "After Dialogue, Enter starts",
    description: null,
    noun: null,
    surfaces: [
      { in: "preferences", section: "writing", order: 10 },
      { in: "palette" },
    ],
    apply: { how: "editor", effect: "behaviour" },
    boot: false,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "writing.typewriterScrolling",
    scope: "personal",
    type: t.boolean(),
    default: false,
    label: "Typewriter scrolling",
    description:
      "Keeps the line you are writing at the same height in the window.",
    noun: null,
    surfaces: [
      { in: "preferences", section: "writing", order: 20 },
      { in: "menu", menu: "view", group: "writing", order: 10 },
      { in: "palette" },
    ],
    apply: { how: "editor", effect: "behaviour" },
    boot: false,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "writing.checkSpelling",
    scope: "personal",
    type: t.boolean(),
    default: true,
    label: "Check spelling as I type",
    description:
      "Underlines misspellings and names that nearly match your project's names. Checks still lists everything before you send.",
    noun: null,
    surfaces: [
      { in: "preferences", section: "writing", order: 30 },
      { in: "menu", menu: "edit", group: "spelling", order: 10 },
      { in: "palette" },
    ],
    apply: { how: "editor", effect: "decorations" },
    boot: false,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "writing.showCursors",
    scope: "personal",
    type: t.boolean(),
    default: true,
    label: "Show other people's cursors",
    description:
      "Hides their cursors and name tabs when off. Margin avatars stay, and other people still see yours.",
    noun: null,
    surfaces: [
      { in: "preferences", section: "writing", order: 40 },
      { in: "menu", menu: "view", group: "people", order: 10 },
      { in: "palette" },
    ],
    apply: {
      how: "attribute",
      name: "data-cursors",
      values: { true: null, false: "off" },
    },
    boot: false,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "writing.announce",
    scope: "personal",
    type: t.choice([
      { value: "elements", label: "Element changes" },
      { value: "elements_pages", label: "Element changes and page starts" },
      {
        value: "elements_pages_people",
        label: "Element changes, page starts and people arriving or leaving",
      },
    ]),
    default: "elements_pages" as const,
    label: "Announce while writing",
    description:
      "For screen readers. 'Where am I?' reads everything on request, whatever you choose here.",
    noun: null,
    surfaces: [
      { in: "preferences", section: "writing", order: 50 },
      { in: "palette" },
    ],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: [],
  }),
] as const);
