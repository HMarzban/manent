// Template mapping for series episodes and project settings: maps each template to its format and own defaults,
// detects when Format and style rows diverge into Custom, and initializes a new episode's script, title page and acts.
import {
  ORIGIN_TITLE_PAGE,
  readProjectMap,
  scriptBody,
  titlePage,
  yXmlFragmentForBinding,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { TITLE_PAGE_FIELDS, randomBlockId } from "@manent/schema";
import type {
  ActBreakKind,
  BlockJSON,
  FormatId,
  TitlePageField,
  TitlePageFields,
} from "@manent/schema";
import { SETTINGS, paperForRegion } from "@manent/settings";
import type { SettingValue, SettingsStore } from "@manent/settings";
import type { DocHandle } from "@manent/sync-client";
import { firstBlock } from "../editor-host/first-block.ts";
import type { ProjectKind } from "../services/ports.ts";

export type ProjectTemplate = SettingValue<"project.template">;

export const FORMAT_STYLE_KEYS = [
  "project.style",
  "project.titlePage",
  "project.header",
  "project.footer",
  "project.acts",
  "project.numbering",
  "project.colourOrder",
  "project.targetPages",
  "project.dateFormat",
] as const;

export type FormatStyleKey = (typeof FORMAT_STYLE_KEYS)[number];
export type FormatStyleValues = {
  readonly [K in FormatStyleKey]: SettingValue<K>;
};

const KIND_FORMATS: Readonly<Record<ProjectKind, FormatId>> = Object.freeze({
  film: "screenplay",
  series: "screenplay",
  show: "variety",
  news: "variety",
  podcast: "variety",
  book: "manuscript",
  game: "game",
  stage_play: "stage_play",
});

const TEMPLATE_FORMATS: Readonly<
  Record<Exclude<ProjectTemplate, "custom">, FormatId>
> = Object.freeze({
  screenplay: "screenplay",
  drama: "screenplay",
  single_camera: "screenplay",
  multi_camera: "multicam",
  animation: "animation",
  variety: "variety",
  news: "variety",
  podcast: "variety",
  manuscript: "manuscript",
  game: "game",
  stage_play: "stage_play",
});

const EMPTY_TITLE_PAGE: TitlePageFields = Object.freeze({
  title: "",
  credit: "",
  authors: "",
  source: "",
  contact: "",
  draft: "",
  cast: "",
  setting: "",
  summary: "",
});

/** The script format `template` starts new scripts and episodes in; `"custom"` falls back to `projectKind`'s format. */
export function templateFormat(
  template: ProjectTemplate,
  projectKind: ProjectKind = "series",
): FormatId {
  if (template === "custom") return KIND_FORMATS[projectKind];
  return TEMPLATE_FORMATS[template];
}

function defaultFor<K extends FormatStyleKey>(key: K): SettingValue<K> {
  return SETTINGS.get(key).default as SettingValue<K>;
}

const DEFAULT_FORMAT_STYLE: FormatStyleValues = Object.freeze({
  "project.style": defaultFor("project.style"),
  "project.titlePage": defaultFor("project.titlePage"),
  "project.header": defaultFor("project.header"),
  "project.footer": defaultFor("project.footer"),
  "project.acts": defaultFor("project.acts"),
  "project.numbering": defaultFor("project.numbering"),
  "project.colourOrder": defaultFor("project.colourOrder"),
  "project.targetPages": defaultFor("project.targetPages"),
  "project.dateFormat": defaultFor("project.dateFormat"),
});

/** The Format and style values belonging to `template`. */
export function templateOwnValues(
  _template: ProjectTemplate,
): FormatStyleValues {
  return DEFAULT_FORMAT_STYLE;
}

function sameJsonValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    return a.every((item, index) => sameJsonValue(item, b[index]));
  }
  const leftKeys = Object.keys(a);
  const rightKeys = Object.keys(b);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) =>
      Object.hasOwn(b, key) &&
      sameJsonValue(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
  );
}

/** True when any Format and style row differs from `template`'s own values (false when `template` is already `"custom"`). */
export function isCustomFromTemplate(
  template: ProjectTemplate,
  values: FormatStyleValues,
): boolean {
  if (template === "custom") return false;
  const own = templateOwnValues(template);
  return FORMAT_STYLE_KEYS.some((key) => !sameJsonValue(values[key], own[key]));
}

/** Reads the effective template name from `store`: `"custom"` when any Format and style row differs from its own values. */
export function effectiveTemplate(store: SettingsStore): ProjectTemplate {
  const chosen = store.get("project.template");
  const values: FormatStyleValues = {
    "project.style": store.get("project.style"),
    "project.titlePage": store.get("project.titlePage"),
    "project.header": store.get("project.header"),
    "project.footer": store.get("project.footer"),
    "project.acts": store.get("project.acts"),
    "project.numbering": store.get("project.numbering"),
    "project.colourOrder": store.get("project.colourOrder"),
    "project.targetPages": store.get("project.targetPages"),
    "project.dateFormat": store.get("project.dateFormat"),
  };
  return isCustomFromTemplate(chosen, values) ? "custom" : chosen;
}

/** Chooses `next` on `store`; choosing `"custom"` keeps every Format and style value as it is, others reset to their own values. */
export function chooseTemplate(
  store: SettingsStore,
  next: ProjectTemplate,
): void {
  store.set("project.template", next);
  if (next === "custom") return;
  const own = templateOwnValues(next);
  for (const key of FORMAT_STYLE_KEYS) {
    if (!sameJsonValue(store.get(key), own[key])) {
      store.set(key, own[key]);
    }
  }
}

export interface ProjectTemplateSettings {
  readonly template: ProjectTemplate;
  readonly titlePage: TitlePageFields;
  readonly acts: readonly string[];
  readonly targetPages: number | null;
}

function parseProjectKey<K extends SettingValueKey>(
  map: Record<string, unknown>,
  key: K,
): SettingValue<K> | null {
  if (!Object.hasOwn(map, key)) return null;
  const parsed = SETTINGS.get(key).type.parse(map[key]);
  return (parsed === null ? null : parsed) as SettingValue<K> | null;
}

type SettingValueKey =
  | "project.template"
  | "project.titlePage"
  | "project.acts"
  | "project.targetPages";

function normalizeTitlePage(
  raw: Readonly<Record<string, string>> | null,
): TitlePageFields {
  if (raw === null) return EMPTY_TITLE_PAGE;
  return {
    title: raw.title ?? "",
    credit: raw.credit ?? "",
    authors: raw.authors ?? "",
    source: raw.source ?? "",
    contact: raw.contact ?? "",
    draft: raw.draft ?? "",
    cast: raw.cast ?? "",
    setting: raw.setting ?? "",
    summary: raw.summary ?? "",
  };
}

/** Reads the series project's template, title page, act labels and target length from its index document. */
export function readProjectTemplateSettings(
  doc: CrdtDoc,
): ProjectTemplateSettings {
  const map = readProjectMap(doc, "template");
  return {
    template: parseProjectKey(map, "project.template") ?? "drama",
    titlePage: normalizeTitlePage(parseProjectKey(map, "project.titlePage")),
    acts: parseProjectKey(map, "project.acts") ?? [],
    targetPages: parseProjectKey(map, "project.targetPages") ?? null,
  };
}

/** Maps an act label such as `"TEASER"`, `"ACT ONE"`, `"END OF ACT ONE"` or `"TAG"` to its `ActBreakKind`. */
export function actBreakKindForLabel(label: string): ActBreakKind {
  const normalized = label.trim().toUpperCase();
  if (normalized === "TEASER") return "teaser";
  if (normalized === "TAG") return "tag";
  if (normalized === "END OF ACT" || normalized.startsWith("END OF ACT "))
    return "end_of_act";
  return "new_act";
}

function actBreakBlock(label: string): BlockJSON {
  return {
    type: "block",
    attrs: {
      id: randomBlockId(),
      type: "act_break",
      kind: actBreakKindForLabel(label),
    },
    ...(label.length > 0 ? { content: [{ type: "text", text: label }] } : {}),
  };
}

export interface StartEpisodeOptions {
  readonly format: FormatId;
  readonly language: string;
  readonly titlePage: TitlePageFields;
  readonly acts: readonly string[];
}

/**
 * Initializes a new episode's script on the device: sets its format and regional paper, writes one `act_break` block
 * per project act label in order (or one empty first block when there are none), and copies non-empty title page fields.
 */
export function startEpisodeScript(
  handle: DocHandle,
  options: StartEpisodeOptions,
): void {
  const doc = handle.doc();
  if (yXmlFragmentForBinding(doc).length === 0) {
    const blocks: readonly BlockJSON[] =
      options.acts.length > 0
        ? options.acts.map(actBreakBlock)
        : [firstBlock(options.format)];
    scriptBody(doc).write((w) => w.insertBlocks(null, blocks));
  }
  const scriptTitlePage = titlePage(doc);
  for (const field of TITLE_PAGE_FIELDS) {
    const value = options.titlePage[field as TitlePageField];
    if (value !== "") scriptTitlePage.set(field, value, ORIGIN_TITLE_PAGE);
  }
  handle.setSetting("script.format", options.format);
  handle.setSetting("script.paper", paperForRegion(options.language));
}
