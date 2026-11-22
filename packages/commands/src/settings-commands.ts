// The commands every setting generates: one per value of a choice, one switch for a boolean.
import { appliesToFormat } from "@manent/settings";
import type {
  MenuId,
  SettingDefinition,
  SettingsRegistry,
  Surface,
} from "@manent/settings";
import type { CommandDefinition, MenuPlacement } from "./define.ts";

type SettingCommand = CommandDefinition<`setting.${string}`>;
type PreferencesSurface = Extract<Surface, { in: "preferences" }>;
type MenuSurface = Extract<Surface, { in: "menu" }>;

const NO_KEYS = Object.freeze({ mac: [], windows: [], linux: [] });

const isPreferencesSurface = (s: Surface): s is PreferencesSurface =>
  s.in === "preferences";
const isMenuSurface = (s: Surface): s is MenuSurface => s.in === "menu";

/** A key into the palette's home words: Script settings for a script setting, its Preferences pane for a preference. */
function homeOf(def: SettingDefinition): string | null {
  if (def.scope === "script") return "homeScriptSettings";
  const pane = def.surfaces.find(isPreferencesSurface);
  return pane === undefined ? null : `homePreferences:${pane.section}`;
}

// a setting with no menu of its own is grouped where its scope is changed from: Format for a script, View for a preference
function groupOf(def: SettingDefinition): MenuId {
  const menu = def.surfaces.find(isMenuSurface);
  if (menu !== undefined) return menu.menu;
  return def.scope === "script" ? "format" : "view";
}

function menusOf(
  def: SettingDefinition,
  submenu: string | null,
): readonly MenuPlacement[] {
  return def.surfaces
    .filter(isMenuSurface)
    .map(({ menu, group, order }) => ({ menu, group, order, submenu }));
}

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
    // a script setting has no value off a document, and none in a format it does nothing for
    visible:
      def.scope === "script"
        ? (ctx) =>
            ctx.docOpen &&
            (ctx.format === null || appliesToFormat(def.key, ctx.format))
        : null,
    passThrough: null,
    palette: def.surfaces.some((s) => s.in === "palette")
      ? { keywords: def.keywords }
      : { hidden: "the setting is not offered in the palette" },
    opens: null,
    reach: "self",
  };
}

function commandsOf(def: SettingDefinition): readonly SettingCommand[] {
  const { key, label, type } = def;
  if (type.choices === null)
    return [
      {
        ...shared(def),
        id: `setting.${key}`,
        label: `${label}: turn on`,
        checked: (_ctx, read) => read.get(key) === true,
        menus: menusOf(def, null),
        setting: { key, value: null },
      },
    ];
  return type.choices.map((choice) => ({
    ...shared(def),
    id: `setting.${key}.${choice.value}`,
    label: `${label}: ${choice.label}`,
    checked: (_ctx, read) => read.get(key) === choice.value,
    menus: menusOf(def, label),
    setting: { key, value: choice.value },
  }));
}

/**
 * The commands `registry` generates, in its order: `setting.<key>` turns a boolean over, `setting.<key>.<value>` sets one
 * choice. A choice's menu placements are drawn under a submenu named by the setting's label ("Theme" › "Dark").
 */
export function settingCommands(
  registry: SettingsRegistry<readonly SettingDefinition[]>,
): readonly SettingCommand[] {
  return registry.all.flatMap(commandsOf);
}
