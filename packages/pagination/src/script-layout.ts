// A script's layout settings and the page profile they give, so the server and the formats lay a script out exactly as the editor does.
import type { Engine } from "./engines/index.ts";
import type { PageProfile } from "./page-profile.ts";

export interface ScriptLayoutSettings {
  readonly format: string;
  readonly paper: string;
  readonly moresAtBreaks: boolean;
  readonly sameSpeakerContd: boolean;
  readonly sceneContinued: boolean;
  /** Never a setting: true while the script is in production. False leaves the format's own default, so a multi-camera script letters its scenes before production. */
  readonly scenesNumbered: boolean;
}

/** The script settings the page profile is made from. */
export const LAYOUT_SETTING_KEYS: readonly string[] = Object.freeze([
  "script.format",
  "script.paper",
  "script.moresAtBreaks",
  "script.sameSpeakerContd",
  "script.sceneContinued",
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

/** The five `script.*` layout settings as `read` gives them; a missing or ill-typed value takes its default. Scenes are not numbered. */
export function readLayoutSettings(
  read: (key: string) => unknown,
): ScriptLayoutSettings {
  const d = DEFAULT_LAYOUT_SETTINGS;
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
  });
}
