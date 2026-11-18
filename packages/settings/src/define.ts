// Declaring one setting.
import type { SettingDefinition } from "./types.ts";

/** One setting, declared once; its key keeps its literal type, so a registry knows every key it holds. */
export function setting<const K extends string, T>(
  def: SettingDefinition<K, T>,
): SettingDefinition<K, T> {
  return Object.freeze({ ...def });
}
