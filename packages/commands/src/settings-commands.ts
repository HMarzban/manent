// The commands every setting generates: one per value of a choice, one switch for a boolean, none for any other kind.
import { appliesToFormat } from "@manent/settings";
import type {
  MenuId,
  Scope,
  SettingDefinition,
  SettingsRegistry,
  Surface,
} from "@manent/settings";
import type { CommandDefinition, MenuPlacement } from "./define.ts";

type SettingCommand = CommandDefinition<`setting.${string}`>;
type Registry = SettingsRegistry<readonly SettingDefinition[]>;
type PreferencesSurface = Extract<Surface, { in: "preferences" }>;
type MenuSurface = Extract<Surface, { in: "menu" }>;

const NO_KEYS = Object.freeze({ mac: [], windows: [], linux: [] });

const isPreferencesSurface = (s: Surface): s is PreferencesSurface =>
  s.in === "preferences";
const isMenuSurface = (s: Surface): s is MenuSurface => s.in === "menu";
const isPreference = (def: SettingDefinition): boolean =>
  def.scope === "personal" || def.scope === "device";

/** A key into the palette's home words: Script settings for a script setting, its Preferences pane for a preference. */
function homeOf(def: SettingDefinition): string | null {
  if (def.scope === "script") return "homeScriptSettings";
  const pane = def.surfaces.find(isPreferencesSurface);
  return pane === undefined ? null : `homePreferences:${pane.section}`;
}

// a setting with no menu of its own is grouped where its scope is changed from: Format for a script or a project, View
// for a preference
function groupOf(def: SettingDefinition): MenuId {
  const menu = def.surfaces.find(isMenuSurface);
  if (menu !== undefined) return menu.menu;
  return isPreference(def) ? "view" : "format";
}

// a choice is drawn under its own label; a switch under the label of the setting it is `under`, if any
function submenuOf(
  def: SettingDefinition,
  under: string | null,
  registry: Registry,
): string | null {
  if (def.type.choices !== null) return def.label;
  return under === null ? null : registry.get(under).label;
}

function menusOf(
  def: SettingDefinition,
  registry: Registry,
): readonly MenuPlacement[] {
  return def.surfaces
    .filter(isMenuSurface)
    .map(({ menu, group, order, under }) => ({
      menu,
      group,
      order,
      submenu: submenuOf(def, under, registry),
    }));
}

// a script setting has no value off a document, and none in a format it does nothing for; a project setting none
// outside a project
const VISIBLE: Readonly<
  Record<Scope, (def: SettingDefinition) => SettingCommand["visible"]>
> = Object.freeze({
  personal: () => null,
  device: () => null,
  script: (def) => (ctx) =>
    ctx.docOpen &&
    (ctx.format === null || appliesToFormat(def.key, ctx.format)),
  project: () => (ctx) => ctx.projectKind !== null,
});

function shared(
  def: SettingDefinition,
): Omit<SettingCommand, "id" | "label" | "checked" | "menus" | "setting"> {
  return {
    group: groupOf(def),
    home: homeOf(def),
    scope: "global",
    keys: NO_KEYS,
    keysFixed: false,
    when: null,
    whyNot: null,
    visible: VISIBLE[def.scope](def),
    passThrough: null,
    palette: def.surfaces.some((s) => s.in === "palette")
      ? { keywords: def.keywords }
      : { hidden: "the setting is not offered in the palette" },
    opens: null,
    reach: "self",
  };
}

const capitalised = (text: string): string =>
  text.length === 0 ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** Standalone palette label for a setting whose in-section label is too generic on its own ("Show" under "Scene numbers"). */
function choiceHeading(def: SettingDefinition): string {
  if (def.label === "Show" && def.noun !== null) return capitalised(def.noun);
  return def.label;
}

function commandsOf(
  def: SettingDefinition,
  registry: Registry,
): readonly SettingCommand[] {
  const { key, label, type } = def;
  // a value typed or edited in its row has no command of its own
  if (type.kind !== "boolean" && type.kind !== "choice") return [];
  if (type.choices === null)
    return [
      {
        ...shared(def),
        id: `setting.${key}`,
        label: (_ctx, read) =>
          `${label}: ${read.get(key) === true ? "turn off" : "turn on"}`,
        checked: (_ctx, read) => read.get(key) === true,
        menus: menusOf(def, registry),
        setting: { key, value: null },
      },
    ];
  const heading = choiceHeading(def);
  return type.choices.map((choice) => ({
    ...shared(def),
    id: `setting.${key}.${choice.value}`,
    label: `${heading}: ${choice.label}`,
    checked: (_ctx, read) => read.get(key) === choice.value,
    menus: menusOf(def, registry),
    setting: { key, value: choice.value },
  }));
}

/**
 * The commands `registry` generates, in its order: `setting.<key>` turns a boolean over, and its label says which way
 * ("Typewriter scrolling: turn off" while it is on); `setting.<key>.<value>` sets one choice ("Theme: Dark"). A choice's
 * menu placements are drawn under a submenu named by the setting's label ("Theme" › "Dark"), and so is a switch whose
 * menu surface is `under` that setting. Throws a RangeError for an `under` the registry does not hold.
 */
export function settingCommands(registry: Registry): readonly SettingCommand[] {
  return registry.all.flatMap((def) => commandsOf(def, registry));
}
