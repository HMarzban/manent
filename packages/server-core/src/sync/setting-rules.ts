// The keys a script's settings map may hold, read from the settings' own definitions.
import { SETTINGS } from "@manent/settings";
import type { SettingDefinition } from "@manent/settings";
import type { SettingRules } from "./ports.ts";

/** A key is a script setting only when a definition of scope "script" has it; its value must parse. */
export function settingRulesFrom(
  definitions: readonly SettingDefinition[],
): SettingRules {
  const scripts = new Map(
    definitions
      .filter((definition) => definition.scope === "script")
      .map((definition) => [definition.key, definition]),
  );
  return Object.freeze<SettingRules>({
    check(key, value) {
      const definition = scripts.get(key);
      if (definition === undefined) return { ok: false, code: "unknown_key" };
      if (!definition.type.parse(value).ok)
        return { ok: false, code: "bad_value" };
      return { ok: true };
    },
    isGuarded: (key) => (scripts.get(key)?.guard ?? null) !== null,
  });
}

/** The rules of every setting this build defines. */
export const PRODUCT_SETTING_RULES: SettingRules = settingRulesFrom(
  SETTINGS.all,
);
