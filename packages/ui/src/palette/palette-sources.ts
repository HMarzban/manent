// What the palette lists: a row's shape, a source's shape, and the sources of commands and settings.
import type { CommandDefinition, CommandService } from "@manent/commands";
import { SECTION_IDS, SETTINGS } from "@manent/settings";
import type { Platform, Scope, SectionId } from "@manent/settings";
import { keyLabel } from "../commands-react/key-labels.ts";
import { MENU_WORDS, READOUT_WORDS } from "../words/document.ts";
import { PREFERENCES_WORDS } from "../words/preferences.ts";
import { MENU_LABELS } from "./menu-labels.ts";
import { matchesQuery } from "./palette-rank.ts";

/** One row as the palette draws it; every text is evaluated, and `keys` is the platform's label of the first chord. */
export interface PaletteRow {
  id: string;
  kind: "command" | "setting" | "place" | "document" | "person" | "help";
  label: string;
  /** A switch's current value ("On"); null for every other row. */
  value: string | null;
  /** What a setting applies to ("yours", "this script"); null for a row that is not a setting. */
  scopeWord: string | null;
  /** Where the feature lives ("Details → Script", "File"). */
  home: string | null;
  keys: string | null;
  /** True on a choice or a command that is current, false on one that is not; null where neither applies. */
  checked: boolean | null;
  enabled: boolean;
  whyNot: string | null;
}

/** Answers at once; a slower source answers with more rows on a later call, and they are drawn below. */
export interface PaletteSource {
  kind: PaletteRow["kind"];
  rows(query: string): readonly PaletteRow[];
}

/** Which sources the palette asks: all of them, places alone, or Beside's alone, with no menus. */
export type PaletteFilter = "all" | "places" | "beside";

type Shell = "web" | "desktop";

interface SourceOptions {
  commands: readonly CommandDefinition[];
  service: CommandService;
  platform: Platform;
  shell: Shell;
}

const HOME_PREFERENCES = "homePreferences:";

function paneLabel(pane: string, shell: Shell): string | null {
  const labels: Readonly<Record<SectionId, string>> = {
    writing: PREFERENCES_WORDS.writing,
    appearance: PREFERENCES_WORDS.appearance,
    keyboard: PREFERENCES_WORDS.keyboard,
    account: PREFERENCES_WORDS.account,
    device: PREFERENCES_WORDS.device(shell === "desktop"),
  };
  const section = SECTION_IDS.find((id) => id === pane);
  return section === undefined ? null : labels[section];
}

/** The first menu of `def`'s that the palette has a word for, with its submenu ("View → Zoom"); null when none. */
function menuHome(def: CommandDefinition): string | null {
  for (const { menu, submenu } of def.menus) {
    const label = MENU_LABELS[menu];
    if (label !== null) return MENU_WORDS.homeMenu(label, submenu);
  }
  return null;
}

/** The words of a command's home: Script settings, a Preferences pane, where revisions start, or else the menu that holds it. */
function homeText(def: CommandDefinition, shell: Shell): string | null {
  const { home } = def;
  if (home === "homeScriptSettings") return MENU_WORDS.homeScriptSettings;
  if (home === "homeBeforeLock") return MENU_WORDS.homeBeforeLock;
  if (home === null || !home.startsWith(HOME_PREFERENCES)) return menuHome(def);
  const label = paneLabel(home.slice(HOME_PREFERENCES.length), shell);
  return label === null ? null : MENU_WORDS.homePreferences(label);
}

/** The commands of one kind the palette may list now: not hidden from it, and visible in this context. */
function listed(
  options: SourceOptions,
  kind: "command" | "setting",
): { def: CommandDefinition; keywords: readonly string[] }[] {
  return options.commands.flatMap((def) =>
    "hidden" in def.palette ||
    (def.setting === null) !== (kind === "command") ||
    !options.service.state(def.id).visible
      ? []
      : [{ def, keywords: def.palette.keywords }],
  );
}

function baseRow(
  def: CommandDefinition,
  options: SourceOptions,
): Pick<PaletteRow, "id" | "home" | "keys" | "checked" | "enabled" | "whyNot"> {
  const state = options.service.state(def.id);
  const [chord] = state.keys;
  return {
    id: def.id,
    home: homeText(def, options.shell),
    keys: chord === undefined ? null : keyLabel(chord, options.platform),
    checked: state.checked,
    enabled: state.enabled,
    whyNot: state.whyNot,
  };
}

/** Every command but the settings', found by its evaluated label and its palette keywords. */
export function createCommandSource(options: SourceOptions): PaletteSource {
  return {
    kind: "command",
    rows: (query) =>
      listed(options, "command").flatMap(({ def, keywords }) => {
        const label = options.service.state(def.id).label;
        if (!matchesQuery(query, [label, ...keywords])) return [];
        const row: PaletteRow = {
          ...baseRow(def, options),
          kind: "command",
          label,
          value: null,
          scopeWord: null,
        };
        return [row];
      }),
  };
}

/**
 * Every setting command: a choice is one row per value ("Theme: Dark"), a switch one row with its value
 * ("Same-speaker (CONT'D)", "On"). Each carries the word for what its setting applies to; `scopeWords.device`
 * is "this device" on desktop and "this browser" on the web.
 */
export function createSettingSource(
  options: SourceOptions & {
    settings: { get(key: string): unknown };
    scopeWords: Readonly<Record<Scope, string>>;
  },
): PaletteSource {
  return {
    kind: "setting",
    rows: (query) =>
      listed(options, "setting").flatMap(({ def, keywords }) => {
        const target = def.setting;
        const setting = SETTINGS.all.find((s) => s.key === target?.key);
        if (target === null || setting === undefined) return [];
        const commandLabel = options.service.state(def.id).label;
        const isSwitch = target.value === null;
        const current = options.settings.get(target.key);
        const on = current === true;
        const value = on ? READOUT_WORDS.valueOn : READOUT_WORDS.valueOff;
        const row: PaletteRow = {
          ...baseRow(def, options),
          kind: "setting",
          label: isSwitch ? setting.label : commandLabel,
          value: isSwitch ? value : null,
          scopeWord: options.scopeWords[setting.scope],
          // read from the store the value is read from, which is the open script's; a switch says its value in words
          checked: isSwitch ? null : current === target.value,
        };
        const texts = [row.label, commandLabel, row.value ?? "", ...keywords];
        return matchesQuery(query, texts) ? [row] : [];
      }),
  };
}
