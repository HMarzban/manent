// Per-template defaults, Custom divergence detection, and undoable template switching for Project settings.
import { SETTINGS } from "@manent/settings";
import type { SettingValue, SettingsStore } from "@manent/settings";
import { TEMPLATE_LADDERS } from "./ladder.ts";
import { entryHasVisibleChanges } from "./style-defaults.ts";
import type { StyleMap } from "./style-defaults.ts";

export type ProjectTemplate = SettingValue<"project.template">;

export const TEMPLATE_CONTROLLED_KEYS = Object.freeze([
  "project.style",
  "project.header",
  "project.footer",
  "project.acts",
  "project.numbering",
  "project.colourOrder",
  "project.targetPages",
  "project.dateFormat",
  "project.ladder",
] as const);

export type TemplateControlledKey = (typeof TEMPLATE_CONTROLLED_KEYS)[number];

export type TemplateDefaults = {
  readonly [K in TemplateControlledKey]: SettingValue<K>;
};

const NO_ACTS: readonly string[] = Object.freeze([]);
const DRAMA_ACTS: readonly string[] = Object.freeze([
  "Teaser",
  "Act One",
  "Act Two",
  "Act Three",
  "Act Four",
  "Act Five",
]);
const SINGLE_CAM_ACTS: readonly string[] = Object.freeze([
  "Cold Open",
  "Act One",
  "Act Two",
  "Act Three",
  "Tag",
]);
const MULTI_CAM_ACTS: readonly string[] = Object.freeze([
  "Cold Open",
  "Act One",
  "Act Two",
  "Tag",
]);
const ANIMATION_ACTS: readonly string[] = Object.freeze([
  "Act One",
  "Act Two",
  "Act Three",
]);
const STAGE_PLAY_ACTS: readonly string[] = Object.freeze([
  "Act One",
  "Act Two",
]);

const TEMPLATE_ACTS: Readonly<Record<ProjectTemplate, readonly string[]>> =
  Object.freeze({
    screenplay: NO_ACTS,
    drama: DRAMA_ACTS,
    single_camera: SINGLE_CAM_ACTS,
    multi_camera: MULTI_CAM_ACTS,
    animation: ANIMATION_ACTS,
    variety: NO_ACTS,
    news: NO_ACTS,
    podcast: NO_ACTS,
    manuscript: NO_ACTS,
    game: NO_ACTS,
    stage_play: STAGE_PLAY_ACTS,
    custom: NO_ACTS,
  });

const TEMPLATE_TARGET_PAGES: Readonly<Record<ProjectTemplate, number | null>> =
  Object.freeze({
    screenplay: 110,
    drama: 58,
    single_camera: 32,
    multi_camera: 44,
    animation: 28,
    variety: null,
    news: null,
    podcast: null,
    manuscript: null,
    game: null,
    stage_play: 90,
    custom: null,
  });

function defaultFor<K extends TemplateControlledKey>(key: K): SettingValue<K> {
  return SETTINGS.get(key).default as SettingValue<K>;
}

const BASE_DEFAULTS = Object.freeze({
  "project.style": defaultFor("project.style"),
  "project.header": defaultFor("project.header"),
  "project.footer": defaultFor("project.footer"),
  "project.numbering": defaultFor("project.numbering"),
  "project.colourOrder": defaultFor("project.colourOrder"),
  "project.dateFormat": defaultFor("project.dateFormat"),
});

/** Per-template default values for every Format, style and ladder setting controlled by `template`. */
export function templateDefaultsFor(
  template: ProjectTemplate,
): TemplateDefaults {
  return {
    ...BASE_DEFAULTS,
    "project.acts": TEMPLATE_ACTS[template],
    "project.targetPages": TEMPLATE_TARGET_PAGES[template],
    "project.ladder": TEMPLATE_LADDERS[template],
  };
}

function styleHasChanges(style: StyleMap): boolean {
  return Object.values(style).some((entry) => entryHasVisibleChanges(entry));
}

function keyMatchesTemplate<K extends TemplateControlledKey>(
  key: K,
  store: SettingsStore,
  defaults: TemplateDefaults,
): boolean {
  const explained = store.explain(key);
  // An unset key inherits the template cleanly and never counts as diverging.
  if (explained.source === "default") return true;
  if (key === "project.style") {
    return !styleHasChanges(explained.value as StyleMap);
  }
  const def = SETTINGS.get(key);
  return def.type.equals(explained.value as never, defaults[key] as never);
}

/** True when any controlled Format, style or ladder setting explicitly diverges from the selected template's defaults. */
export function divergesFromTemplate(store: SettingsStore): boolean {
  const chosen = store.get("project.template");
  if (chosen === "custom") return false;
  const defaults = templateDefaultsFor(chosen);
  return TEMPLATE_CONTROLLED_KEYS.some(
    (key) => !keyMatchesTemplate(key, store, defaults),
  );
}

type SnapshotKey = "project.template" | TemplateControlledKey;

export interface TemplateSnapshotEntry {
  readonly key: SnapshotKey;
  readonly source: "own" | "default";
  readonly value: SettingValue<SnapshotKey>;
}

export type TemplateSnapshot = readonly TemplateSnapshotEntry[];

/** Captures the template and every controlled setting so a template switch or reset can be undone in full. */
export function captureTemplateSnapshot(
  store: SettingsStore,
): TemplateSnapshot {
  const keys: readonly SnapshotKey[] = [
    "project.template",
    ...TEMPLATE_CONTROLLED_KEYS,
  ];
  return keys.map((key) => {
    const explained = store.explain(key);
    return { key, source: explained.source, value: explained.value };
  });
}

function applyControlledDefault<K extends TemplateControlledKey>(
  store: SettingsStore,
  key: K,
  value: SettingValue<K>,
): void {
  const def = SETTINGS.get(key);
  const explained = store.explain(key);
  if (def.type.equals(value as never, def.default as never)) {
    if (explained.source === "own") store.reset(key);
    return;
  }
  if (
    explained.source === "default" ||
    !def.type.equals(explained.value as never, value as never)
  )
    store.set(key, value as never);
}

/**
 * Switches `project.template` to `next` and applies its per-template defaults (keeping current values when `next` is
 * `"custom"`). Returns false if the write is refused.
 */
export function applyTemplateSwitch(
  store: SettingsStore,
  next: ProjectTemplate,
): boolean {
  const result = store.set("project.template", next);
  if (!result.ok) return false;
  if (next === "custom") return true;
  const defaults = templateDefaultsFor(next);
  for (const key of TEMPLATE_CONTROLLED_KEYS) {
    applyControlledDefault(store, key, defaults[key]);
  }
  return true;
}

/** Restores every setting captured by `captureTemplateSnapshot`, resetting keys that were previously unset. */
export function restoreTemplateSnapshot(
  store: SettingsStore,
  snapshot: TemplateSnapshot,
): void {
  for (const entry of snapshot) {
    if (entry.source === "default") {
      store.reset(entry.key);
    } else {
      store.set(entry.key, entry.value as never);
    }
  }
}
