// Value formatting, provenance lines and validated writes shared by SettingRow.
import { SETTINGS } from "@manent/settings";
import type {
  Choice,
  Explained,
  SettingKey,
  SettingValue,
  SettingsStore,
} from "@manent/settings";
import { READOUT_WORDS } from "../words/document.ts";
import { formatCount, formatDate } from "../words/format.ts";
import { PREFERENCES_WORDS } from "../words/preferences.ts";
import { TIMING_WORDS } from "../words/timing.ts";

/** How a number setting with a unit names its value, and its null. */
export interface NumberWords {
  none: string;
  count(n: number): string;
}

export const NUMBER_WORDS: Readonly<Record<string, NumberWords>> =
  Object.freeze({
    "project.targetPages": {
      none: "No target",
      count: (n: number) => `${formatCount(n)} pages`,
    },
    "project.readRate": { none: "", count: TIMING_WORDS.readRateValue },
  });

export function choiceLabel(
  choices: readonly Choice<string>[],
  value: unknown,
): string {
  return choices.find((choice) => choice.value === value)?.label ?? "";
}

/**
 * How a setting's value is named in a row: a choice by its label, a switch "On" or "Off", a number by its digits and
 * unit, a text as typed; "" for a value only its own row names.
 */
export function formatSettingValue(key: SettingKey, value: unknown): string {
  const { kind, choices } = SETTINGS.get(key).type;
  if (choices !== null) return choiceLabel(choices, value);
  if (kind === "boolean")
    return value === true ? READOUT_WORDS.valueOn : READOUT_WORDS.valueOff;
  const words = NUMBER_WORDS[key];
  if (kind === "number" && words !== undefined)
    return typeof value === "number" ? words.count(value) : words.none;
  if (typeof value === "number") return formatCount(value);
  return typeof value === "string" ? value : "";
}

/** Writes what a control reports, once the setting's own type accepts it. */
export function setFrom(
  store: SettingsStore,
  key: SettingKey,
  input: unknown,
): void {
  const parsed = SETTINGS.get(key).type.parse(input);
  if (parsed.ok) store.set(key, parsed.value);
}

/** The line under the control: when you set it, with its default; or the default alone. */
export function defaultLine(
  key: SettingKey,
  explained: Explained<SettingValue<SettingKey>>,
  deviceName: string | null,
): string {
  const defaultLabel = formatSettingValue(key, SETTINGS.get(key).default);
  const { modified, provenance } = explained;
  // a value set by someone else is never said to be yours, and the row has no way to name them
  if (
    !modified ||
    provenance === null ||
    provenance.at === null ||
    provenance.byUserId !== null
  )
    return PREFERENCES_WORDS.defaultIs(defaultLabel);
  const { on } = provenance;
  // "" is a device that never said its name
  const from = on === null || on === "" || on === deviceName ? null : on;
  return PREFERENCES_WORDS.setByYou(
    formatDate(provenance.at),
    defaultLabel,
    from,
  );
}
