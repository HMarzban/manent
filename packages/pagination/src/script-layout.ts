// A script's layout settings and the page profile they give, so the server and the formats lay a script out exactly as the editor does.
import type { Engine, ProfileOptions } from "./engines/index.ts";
import type { ElementSpec, PageProfile, SpecKey } from "./page-profile.ts";

/** Ten cells per inch on the fixed screenplay grid. */
export const CELLS_PER_INCH = 10;

export interface ScriptLayoutSettings {
  readonly format: string;
  readonly paper: string;
  readonly moresAtBreaks: boolean;
  readonly sameSpeakerContd: boolean;
  readonly sceneContinued: boolean;
  /** Never a setting: true while the script is in production. False leaves the format's own default, so a multi-camera script letters its scenes before production. */
  readonly scenesNumbered: boolean;
  /** Per-element style overrides from `script.style`, in layout units. */
  readonly elements?: ProfileOptions["elements"];
}

/** The script settings the page profile is made from. */
export const LAYOUT_SETTING_KEYS: readonly string[] = Object.freeze([
  "script.format",
  "script.paper",
  "script.moresAtBreaks",
  "script.sameSpeakerContd",
  "script.sceneContinued",
  "script.style",
]);

/** The defaults of the five `script.*` layout settings, and scenes not numbered. */
export const DEFAULT_LAYOUT_SETTINGS: ScriptLayoutSettings = Object.freeze({
  format: "screenplay",
  paper: "letter",
  moresAtBreaks: true,
  sameSpeakerContd: true,
  sceneContinued: false,
  scenesNumbered: false,
});

const stringOr = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

const booleanOr = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const SPEC_KEYS: Readonly<Record<SpecKey, true>> = {
  scene_heading: true,
  action: true,
  character: true,
  parenthetical: true,
  dialogue: true,
  transition: true,
  shot: true,
  general: true,
  slug: true,
  bracket: true,
  emote: true,
  camera: true,
  engine: true,
  group: true,
  page_break: true,
  chapter: true,
  body: true,
  break: true,
  quote: true,
  "act_break.new_act": true,
  "act_break.end_of_act": true,
  "act_break.teaser": true,
  "act_break.tag": true,
};

function asSpecKey(key: string): SpecKey | null {
  return Object.hasOwn(SPEC_KEYS, key) ? (key as SpecKey) : null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMeasure = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Stage 2 element style fields that change layout, converting inches to cells. */
function readElementStyle(
  raw: unknown,
): ProfileOptions["elements"] | undefined {
  if (!isRecord(raw)) return undefined;
  const changes: Partial<Record<SpecKey, Partial<ElementSpec>>> = {};
  let any = false;
  for (const [rawKey, entry] of Object.entries(raw)) {
    const key = asSpecKey(rawKey);
    if (key === null || !isRecord(entry)) continue;
    const capitalized =
      typeof entry.capitalized === "boolean" ? entry.capitalized : undefined;
    const spaceBefore = isMeasure(entry.spaceBefore)
      ? Math.round(entry.spaceBefore)
      : undefined;
    const indent = isMeasure(entry.indent)
      ? Math.round(entry.indent * CELLS_PER_INCH)
      : undefined;
    const width =
      isMeasure(entry.width) && entry.width > 0
        ? Math.max(1, Math.round(entry.width * CELLS_PER_INCH))
        : undefined;
    if (
      capitalized === undefined &&
      spaceBefore === undefined &&
      indent === undefined &&
      width === undefined
    )
      continue;
    changes[key] = {
      ...(capitalized === undefined ? {} : { capitalized }),
      ...(spaceBefore === undefined ? {} : { spaceBefore }),
      ...(indent === undefined ? {} : { indent }),
      ...(width === undefined ? {} : { width }),
    };
    any = true;
  }
  return any ? changes : undefined;
}

/** The `script.*` layout settings as `read` gives them; a missing or ill-typed value takes its default. Scenes are not numbered. */
export function readLayoutSettings(
  read: (key: string) => unknown,
): ScriptLayoutSettings {
  const d = DEFAULT_LAYOUT_SETTINGS;
  const elements = readElementStyle(read("script.style"));
  return {
    format: stringOr(read("script.format"), d.format),
    paper: stringOr(read("script.paper"), d.paper),
    moresAtBreaks: booleanOr(read("script.moresAtBreaks"), d.moresAtBreaks),
    sameSpeakerContd: booleanOr(
      read("script.sameSpeakerContd"),
      d.sameSpeakerContd,
    ),
    sceneContinued: booleanOr(read("script.sceneContinued"), d.sceneContinued),
    scenesNumbered: false,
    ...(elements === undefined ? {} : { elements }),
  };
}

/** The profile `engine` gives these settings; null for a format without pages (Ink). A paper other than "a4" is letter. */
export function profileFromSettings(
  engine: Engine,
  s: ScriptLayoutSettings,
): PageProfile | null {
  return engine.profileFor(s.format, {
    paper: s.paper === "a4" ? "a4" : "letter",
    speechContinued: s.moresAtBreaks,
    speakerContinued: s.sameSpeakerContd,
    sceneContinued: s.sceneContinued,
    scenesNumbered: s.scenesNumbered ? true : undefined,
    ...(s.elements === undefined ? {} : { elements: s.elements }),
  });
}
