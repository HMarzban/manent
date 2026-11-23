// What a project sets for every script it holds, kept in the project's index: its template, style, title page,
// header and footer, acts, numbering, colours, length, date format and draft names.
import { setting } from "../define.ts";
import { t } from "../types.ts";
import { SCRIPT_HEADER_FOOTER_SETTINGS } from "./script-header-footer.ts";
import { SCRIPT_SETTINGS } from "./script.ts";

const SCRIPT_DEFINITIONS = [
  ...SCRIPT_SETTINGS,
  ...SCRIPT_HEADER_FOOTER_SETTINGS,
] as const;
type ScriptDefinition = (typeof SCRIPT_DEFINITIONS)[number];

/** The script setting `key`, whose value type and default its project's twin shares. Throws RangeError for a key no script setting has. */
function twinOf<K extends ScriptDefinition["key"]>(
  key: K,
): Extract<ScriptDefinition, { key: K }> {
  const def = SCRIPT_DEFINITIONS.find(
    (held): held is Extract<ScriptDefinition, { key: K }> => held.key === key,
  );
  if (def === undefined)
    throw new RangeError(`no script setting is declared as ${key}`);
  return def;
}

// the title page's field names, as the schema lists them: this package imports nothing
const TITLE_PAGE_FIELDS = [
  "title",
  "credit",
  "authors",
  "source",
  "contact",
  "draft",
  "cast",
  "setting",
  "summary",
] as const;

const style = twinOf("script.style");
const header = twinOf("script.header");
const footer = twinOf("script.footer");
const numbering = twinOf("script.numbering");
const colourOrder = twinOf("script.colourOrder");
const dateFormat = twinOf("script.dateFormat");

export const PROJECT_SETTINGS = Object.freeze([
  setting({
    key: "project.template",
    scope: "project",
    type: t.choice([
      { value: "screenplay", label: "Screenplay" },
      { value: "drama", label: "Drama" },
      { value: "single_camera", label: "Single-camera" },
      { value: "multi_camera", label: "Multi-camera" },
      { value: "animation", label: "Animation" },
      { value: "variety", label: "Variety" },
      { value: "news", label: "News" },
      { value: "podcast", label: "Podcast" },
      { value: "manuscript", label: "Manuscript" },
      { value: "game", label: "Game Script" },
      { value: "stage_play", label: "Stage play" },
      { value: "custom", label: "Custom" },
    ]),
    default: "screenplay" as const,
    label: "Template",
    description: null,
    noun: "template",
    surfaces: [
      { in: "projectSettings", group: "format_style", order: 10 },
      { in: "palette" },
    ],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "project.style",
    scope: "project",
    type: style.type,
    default: style.default,
    label: "Element style",
    description: null,
    noun: "element style",
    surfaces: [{ in: "projectSettings", group: "format_style", order: 20 }],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "project.titlePage",
    scope: "project",
    type: t.fields(TITLE_PAGE_FIELDS),
    default: Object.freeze(
      Object.fromEntries(TITLE_PAGE_FIELDS.map((name) => [name, ""])),
    ),
    label: "Title page",
    description: null,
    noun: "title page",
    surfaces: [{ in: "projectSettings", group: "format_style", order: 30 }],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "project.header",
    scope: "project",
    type: header.type,
    default: header.default,
    label: "Header",
    description: null,
    noun: "header",
    surfaces: [{ in: "projectSettings", group: "format_style", order: 40 }],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "project.footer",
    scope: "project",
    type: footer.type,
    default: footer.default,
    label: "Footer",
    description: null,
    noun: "footer",
    surfaces: [{ in: "projectSettings", group: "format_style", order: 50 }],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "project.acts",
    scope: "project",
    type: t.labels({ maxItems: 20, maxLength: 80 }),
    default: Object.freeze([]),
    label: "Act structure",
    description: null,
    noun: "act structure",
    surfaces: [{ in: "projectSettings", group: "format_style", order: 60 }],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "project.numbering",
    scope: "project",
    type: numbering.type,
    default: numbering.default,
    label: numbering.label,
    description: null,
    noun: numbering.noun,
    surfaces: [
      { in: "projectSettings", group: "format_style", order: 70 },
      { in: "palette" },
    ],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "project.colourOrder",
    scope: "project",
    type: colourOrder.type,
    default: colourOrder.default,
    label: colourOrder.label,
    description: null,
    noun: colourOrder.noun,
    surfaces: [
      { in: "projectSettings", group: "format_style", order: 80 },
      { in: "palette" },
    ],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "project.targetPages",
    scope: "project",
    type: t.numberOrNull({ min: 1, max: 999, step: 1 }),
    default: null,
    label: "Target length",
    description: null,
    noun: "target length",
    surfaces: [{ in: "projectSettings", group: "format_style", order: 90 }],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "project.dateFormat",
    scope: "project",
    type: dateFormat.type,
    default: dateFormat.default,
    label: dateFormat.label,
    description: null,
    noun: dateFormat.noun,
    surfaces: [
      { in: "projectSettings", group: "format_style", order: 100 },
      { in: "palette" },
    ],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "project.ladder",
    scope: "project",
    type: t.labels({ maxItems: 20, maxLength: 80 }),
    default: Object.freeze([]),
    label: "Ladder",
    description: null,
    noun: "ladder",
    surfaces: [{ in: "projectSettings", group: "drafts", order: 10 }],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: [],
  }),
] as const);
