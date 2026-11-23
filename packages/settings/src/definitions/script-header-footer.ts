// A script's header, footer, date format and element style: the script's own copy of what its project sets.
import { setting } from "../define.ts";
import type { ElementStyles, HeaderSlots } from "../types.ts";
import { t } from "../types.ts";

const NONE = Object.freeze({ kind: "none" } as const);

/** The "Page number" preset: the page number at the right, from the second page. */
const PAGE_NUMBER: HeaderSlots = Object.freeze({
  left: NONE,
  center: NONE,
  right: Object.freeze({ kind: "page_number" } as const),
  firstPage: false,
  rule: false,
});

/** The "None" preset. */
const EMPTY: HeaderSlots = Object.freeze({
  left: NONE,
  center: NONE,
  right: NONE,
  firstPage: false,
  rule: false,
});

const FORMAT_STYLE: ElementStyles = Object.freeze({});

export const SCRIPT_HEADER_FOOTER_SETTINGS = Object.freeze([
  setting({
    key: "script.header",
    scope: "script",
    type: t.headerSlots(),
    default: PAGE_NUMBER,
    label: "Header",
    description: null,
    noun: "header",
    surfaces: [{ in: "scriptSettings", group: "header_footer", order: 10 }],
    apply: { how: "editor", effect: "layout" },
    boot: false,
    guard: "layout",
    keywords: [],
  }),
  setting({
    key: "script.footer",
    scope: "script",
    type: t.headerSlots(),
    default: EMPTY,
    label: "Footer",
    description: null,
    noun: "footer",
    surfaces: [{ in: "scriptSettings", group: "header_footer", order: 20 }],
    apply: { how: "editor", effect: "layout" },
    boot: false,
    guard: "layout",
    keywords: [],
  }),
  setting({
    key: "script.dateFormat",
    scope: "script",
    type: t.choice([
      { value: "day_month_year", label: "17 Nov 2026" },
      { value: "month_day_year", label: "Nov 17, 2026" },
      { value: "iso", label: "2026-11-17" },
    ]),
    default: "day_month_year" as const,
    label: "Date format",
    description: null,
    noun: "date format",
    surfaces: [
      { in: "scriptSettings", group: "revisions", order: 20 },
      { in: "palette" },
    ],
    apply: { how: "editor", effect: "layout" },
    boot: false,
    guard: "layout",
    keywords: [],
  }),
  // no label or noun: its row is a feature's own, which names it
  setting({
    key: "script.style",
    scope: "script",
    type: t.elementStyle(),
    default: FORMAT_STYLE,
    label: "",
    description: null,
    noun: null,
    surfaces: [{ in: "scriptSettings", group: "page_setup", order: 30 }],
    apply: { how: "editor", effect: "layout" },
    boot: false,
    guard: "layout",
    keywords: [],
  }),
] as const);
