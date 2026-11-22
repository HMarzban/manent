// The Script settings of this release, shared by everyone on a script and guarded once page numbers are locked.
import { setting } from "../define.ts";
import type { SettingValue } from "../store.ts";
import { t } from "../types.ts";

export const SCRIPT_SETTINGS = Object.freeze([
  setting({
    key: "script.format",
    scope: "script",
    type: t.choice([
      { value: "screenplay", label: "Screenplay" },
      { value: "multicam", label: "Multi-camera" },
      { value: "animation", label: "Animation" },
      { value: "variety", label: "Variety" },
      { value: "game", label: "Game Script" },
      { value: "ink", label: "Ink" },
      { value: "manuscript", label: "Manuscript" },
      { value: "stage_play", label: "Stage play" },
    ]),
    default: "screenplay" as const,
    label: "Format",
    description: null,
    noun: "format",
    surfaces: [
      { in: "scriptSettings", group: "page_setup", order: 10 },
      { in: "palette" },
    ],
    apply: { how: "editor", effect: "layout" },
    boot: false,
    guard: "layout",
    keywords: [],
  }),
  setting({
    key: "script.paper",
    scope: "script",
    type: t.choice([
      { value: "letter", label: "US Letter" },
      { value: "a4", label: "A4" },
    ]),
    // fixed, as every shared default is; a new script is given paperForRegion's answer instead
    default: "letter" as const,
    label: "Paper",
    description: null,
    noun: "paper size",
    surfaces: [
      { in: "scriptSettings", group: "page_setup", order: 20 },
      { in: "palette" },
    ],
    apply: { how: "editor", effect: "layout" },
    boot: false,
    guard: "layout",
    keywords: [],
  }),
  setting({
    key: "script.moresAtBreaks",
    scope: "script",
    type: t.boolean(),
    default: true,
    label: "(MORE) and (CONT'D) at page breaks",
    description: null,
    noun: "(MORE) and (CONT'D) at page breaks",
    surfaces: [
      { in: "scriptSettings", group: "mores", order: 10 },
      { in: "palette" },
    ],
    apply: { how: "editor", effect: "layout" },
    boot: false,
    guard: "layout",
    keywords: [],
  }),
  setting({
    key: "script.sameSpeakerContd",
    scope: "script",
    type: t.boolean(),
    default: true,
    label: "Same-speaker (CONT'D)",
    description: null,
    noun: "same-speaker (CONT'D)",
    surfaces: [
      { in: "scriptSettings", group: "mores", order: 20 },
      { in: "palette" },
    ],
    apply: { how: "editor", effect: "layout" },
    boot: false,
    guard: "layout",
    keywords: [],
  }),
  setting({
    key: "script.sceneContinued",
    scope: "script",
    type: t.boolean(),
    default: false,
    label: "Scene CONTINUED",
    description: null,
    noun: "scene CONTINUED",
    surfaces: [
      { in: "scriptSettings", group: "mores", order: 30 },
      { in: "palette" },
    ],
    apply: { how: "editor", effect: "layout" },
    boot: false,
    guard: "layout",
    keywords: [],
  }),
  setting({
    key: "script.numbering",
    scope: "script",
    type: t.choice([
      { value: "suffix", label: "12A" },
      { value: "prefix", label: "A12" },
    ]),
    default: "suffix" as const,
    label: "Numbering scheme",
    description: null,
    noun: "numbering scheme",
    surfaces: [
      { in: "scriptSettings", group: "scene_numbers", order: 10 },
      { in: "palette" },
    ],
    apply: { how: "editor", effect: "layout" },
    boot: false,
    guard: "layout",
    keywords: [],
  }),
  setting({
    key: "script.colourOrder",
    scope: "script",
    // the revision colours' names, written out because this package imports nothing
    type: t.choice([
      {
        value: "standard",
        label:
          "White → Blue → Pink → Yellow → Green → Goldenrod → Buff → Salmon → Cherry",
      },
      {
        value: "extended",
        label:
          "White → Blue → Pink → Yellow → Green → Goldenrod → Buff → Salmon → Cherry → Tan",
      },
    ]),
    default: "standard" as const,
    label: "Colour order",
    description: null,
    noun: "colour order",
    surfaces: [
      { in: "scriptSettings", group: "revisions", order: 10 },
      { in: "palette" },
    ],
    apply: { how: "editor", effect: "layout" },
    boot: false,
    guard: "layout",
    keywords: [],
  }),
] as const);

const LETTER_REGIONS: ReadonlySet<string> = new Set([
  "US",
  "CA",
  "MX",
  "PH",
  "CL",
  "CO",
  "VE",
  "GT",
  "CR",
  "PA",
  "DO",
  "PR",
]);

// language, up to three extended language subtags, an optional script, then the region
const REGION =
  /^[a-z]{2,8}(?:-[a-z]{3}){0,3}(?:-[a-z]{4})?-([a-z]{2}|\d{3})(?:-|$)/i;

/** The paper a new script starts on, from the region of a language tag ("en-US"): A4 when it names no region. */
export function paperForRegion(language: string): "letter" | "a4" {
  const region = REGION.exec(language)?.[1]?.toUpperCase();
  return region !== undefined && LETTER_REGIONS.has(region) ? "letter" : "a4";
}

/** Whether a script setting does something in `format`: a script without pages (Ink) has its format and nothing else. */
export function appliesToFormat(
  key: string,
  format: SettingValue<"script.format">,
): boolean {
  return format !== "ink" || key === "script.format";
}
