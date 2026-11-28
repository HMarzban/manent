// A script's layout settings and the page profile they give, so the server and the formats lay a script out exactly as the editor does.
import { profileFor } from "./engines/v1/profile.ts";
import {
  v3DefaultLinesPerPage,
  v3MaxLinesPerPage,
} from "./engines/v3/profile.ts";
import type { Engine, ProfileOptions } from "./engines/index.ts";
import { PAPERS, SCENE_NUMBER_SIDES } from "./page-profile.ts";
import type {
  ElementSpec,
  PageProfile,
  Paper,
  SceneNumberSides,
  SpecKey,
} from "./page-profile.ts";

/** Ten cells per inch on the fixed screenplay grid. */
export const CELLS_PER_INCH = 10;

const MIN_LINES_SETTING = 10;
const MAX_LINES_SETTING = 70;

export interface ScriptLayoutSettings {
  readonly format: string;
  readonly paper: string;
  /** Whole number in 10..70, or null to use the format's figure for its paper. */
  readonly linesPerPage: number | null;
  readonly moresAtBreaks: boolean;
  readonly sameSpeakerContd: boolean;
  readonly sceneContinued: boolean;
  /** Never a setting: true while the script is in production. False leaves the format's own default, so a multi-camera script letters its scenes before production. */
  readonly scenesNumbered: boolean;
  /** Explicit `script.sceneNumbers` value, or null when unset so multi-camera keeps its default `"both"`. */
  readonly sceneNumberSides: SceneNumberSides | null;
  /** Per-element style overrides from `script.style`, in layout units. */
  readonly elements?: ProfileOptions["elements"];
  /** Manuscript line spacing override from `script.lineSpacing` (1 = single); omitted for default double-spacing. */
  readonly lineSpacing?: 1 | 2;
  /** Layout Engine 3 manuscript mirrored recto/verso margins; defaults to true when omitted. */
  readonly mirrorMargins?: boolean;
  /** Layout Engine 3 manuscript recto chapter starts (inserts blank verso pages); defaults to false. */
  readonly rectoChapters?: boolean;
}

/** The script settings the page profile is made from. */
export const LAYOUT_SETTING_KEYS: readonly string[] = Object.freeze([
  "script.format",
  "script.paper",
  "script.moresAtBreaks",
  "script.sameSpeakerContd",
  "script.sceneContinued",
  "script.style",
  "script.linesPerPage",
  "script.sceneNumbers",
  "script.lineSpacing",
  "script.mirrorMargins",
  "script.rectoChapters",
]);

/** The defaults of the `script.*` layout settings, and scenes not numbered. */
export const DEFAULT_LAYOUT_SETTINGS: ScriptLayoutSettings = Object.freeze({
  format: "screenplay",
  paper: "letter",
  linesPerPage: null,
  moresAtBreaks: true,
  sameSpeakerContd: true,
  sceneContinued: false,
  scenesNumbered: false,
  sceneNumberSides: null,
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
  subheading: true,
  epigraph: true,
  body: true,
  break: true,
  quote: true,
  "act_break.new_act": true,
  "act_break.end_of_act": true,
  "act_break.teaser": true,
  "act_break.tag": true,
  graphic: true,
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

function readLinesPerPage(value: unknown): number | null {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= MIN_LINES_SETTING &&
    value <= MAX_LINES_SETTING
  )
    return value;
  return null;
}

function readSceneNumberSides(value: unknown): SceneNumberSides | null {
  return SCENE_NUMBER_SIDES.find((side) => side === value) ?? null;
}

/** Validates a raw paper setting for `engineVersion`; trade trims require Engine 3, else falls back to `"letter"`. */
export function parsePaper(raw: unknown, engineVersion = 1): Paper {
  if (raw === "a4") return "a4";
  if (engineVersion >= 3 && PAPERS.some((p) => p === raw)) return raw as Paper;
  return "letter";
}

/** The most lines `paper` holds for `format`, using the engine's exact page geometry. */
export function maxLinesPerPage(
  format: string,
  paper: Paper,
  engineVersion = 1,
): number {
  if (engineVersion >= 3 && format === "manuscript")
    return v3MaxLinesPerPage(paper);
  const safePaper = parsePaper(paper, 1);
  const profile =
    profileFor(format, { paper: safePaper, linesPerPage: MAX_LINES_SETTING }) ??
    profileFor("screenplay", {
      paper: safePaper,
      linesPerPage: MAX_LINES_SETTING,
    })!;
  return profile.linesPerPage;
}

/** The format's default lines per page on `paper`. */
export function defaultLinesPerPage(
  format: string,
  paper: Paper,
  engineVersion = 1,
): number {
  if (engineVersion >= 3 && format === "manuscript")
    return v3DefaultLinesPerPage(paper);
  const safePaper = parsePaper(paper, 1);
  const profile =
    profileFor(format, { paper: safePaper }) ??
    profileFor("screenplay", { paper: safePaper })!;
  return profile.linesPerPage;
}

/** The `script.*` layout settings as `read` gives them; a missing or ill-typed value takes its default. Scenes are not numbered. */
export function readLayoutSettings(
  read: (key: string) => unknown,
): ScriptLayoutSettings {
  const d = DEFAULT_LAYOUT_SETTINGS;
  const elements = readElementStyle(read("script.style"));
  const rawLineSpacing = read("script.lineSpacing");
  const lineSpacing: 1 | 2 | undefined =
    rawLineSpacing === "single"
      ? 1
      : rawLineSpacing === "double"
        ? 2
        : undefined;
  const rawMirror = read("script.mirrorMargins");
  const mirrorMargins = typeof rawMirror === "boolean" ? rawMirror : undefined;
  const rawRecto = read("script.rectoChapters");
  const rectoChapters = typeof rawRecto === "boolean" ? rawRecto : undefined;
  return {
    format: stringOr(read("script.format"), d.format),
    paper: stringOr(read("script.paper"), d.paper),
    linesPerPage: readLinesPerPage(read("script.linesPerPage")),
    moresAtBreaks: booleanOr(read("script.moresAtBreaks"), d.moresAtBreaks),
    sameSpeakerContd: booleanOr(
      read("script.sameSpeakerContd"),
      d.sameSpeakerContd,
    ),
    sceneContinued: booleanOr(read("script.sceneContinued"), d.sceneContinued),
    scenesNumbered: false,
    sceneNumberSides: readSceneNumberSides(read("script.sceneNumbers")),
    ...(elements === undefined ? {} : { elements }),
    ...(lineSpacing === undefined ? {} : { lineSpacing }),
    ...(mirrorMargins === undefined ? {} : { mirrorMargins }),
    ...(rectoChapters === undefined ? {} : { rectoChapters }),
  };
}

/** The profile `engine` gives these settings; null for a format without pages (Ink). Trade trims require Engine 3. */
export function profileFromSettings(
  engine: Engine,
  s: ScriptLayoutSettings,
): PageProfile | null {
  const paper = parsePaper(
    s.paper,
    s.format === "manuscript" ? engine.version : 1,
  );
  return engine.profileFor(s.format, {
    paper,
    ...(s.linesPerPage === null ? {} : { linesPerPage: s.linesPerPage }),
    speechContinued: s.moresAtBreaks,
    speakerContinued: s.sameSpeakerContd,
    sceneContinued: s.sceneContinued,
    scenesNumbered: s.scenesNumbered ? true : undefined,
    ...(s.sceneNumberSides === null
      ? {}
      : { sceneNumberSides: s.sceneNumberSides }),
    ...(s.elements === undefined ? {} : { elements: s.elements }),
    ...(s.lineSpacing === undefined
      ? {}
      : { manuscriptLineSpacing: s.lineSpacing }),
    ...(s.mirrorMargins === undefined
      ? {}
      : { mirrorMargins: s.mirrorMargins }),
    ...(s.rectoChapters === true ? { rectoChapters: true } : {}),
  });
}
