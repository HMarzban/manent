import type { SettingsReader } from "./ports.ts";

/** Whether the person wants spelling checked: always, unless their preference is off. */
export function isSpellingChecked(personal: SettingsReader): boolean {
  return personal.get("writing.checkSpelling") !== false;
}
