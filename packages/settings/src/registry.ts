// The registry of every setting, refused when it is malformed.
import type { Scope, SettingDefinition, Surface } from "./types.ts";

/** A search result in Preferences that is not a setting: where the thing lives, or why there is nothing to set. */
export interface SearchPointer {
  readonly label: string;
  readonly keywords: readonly string[];
  readonly kind: "elsewhere" | "answer";
  readonly says: string | { readonly desktop: string; readonly web: string };
  /** The command that opens where it lives; null for an answer. */
  readonly opens: string | null;
}

export interface SettingsRegistry<D extends readonly SettingDefinition[]> {
  readonly all: D;
  /** Throws RangeError for a key the registry does not hold. */
  get(key: D[number]["key"]): D[number];
  byScope(scope: Scope): readonly SettingDefinition[];
  bySurface(surface: Surface["in"]): readonly SettingDefinition[];
  readonly pointers: readonly SearchPointer[];
  readonly retired: ReadonlySet<string>;
}

export const REGISTRY_ERROR_CODES = [
  "duplicate_key",
  "retired_key",
  "bad_default",
  "no_surface",
  "boot_not_attribute",
  "preference_on_layout",
  "preference_off_preferences",
  "shared_on_preferences",
  "bad_key",
] as const;
export type RegistryErrorCode = (typeof REGISTRY_ERROR_CODES)[number];

/** A definition the registry refuses, with the first offending key. */
export class RegistryError extends Error {
  readonly code: RegistryErrorCode;
  readonly key: string;

  constructor(code: RegistryErrorCode, key: string) {
    super(`${key}: ${MESSAGES[code]}`);
    this.name = "RegistryError";
    this.code = code;
    this.key = key;
  }
}

const KEY_PATTERN = /^(writing|appearance|device|script)\.[a-z][a-zA-Z]*$/;

const MESSAGES: Readonly<Record<RegistryErrorCode, string>> = Object.freeze({
  duplicate_key: "a setting key is declared once",
  retired_key: "a retired key is never declared again",
  bad_default: "the default must be a value its type accepts",
  no_surface: "a setting needs at least one surface",
  boot_not_attribute:
    "a setting applied at boot must be applied as an attribute",
  preference_on_layout: "a preference never changes the layout",
  preference_off_preferences: "a preference is never shown in Script settings",
  shared_on_preferences: "a script setting is never shown in Preferences",
  bad_key: `a setting key must match ${KEY_PATTERN.source}`,
});

const isPreference = (def: SettingDefinition): boolean =>
  def.scope === "personal" || def.scope === "device";
const isShownIn = (def: SettingDefinition, place: Surface["in"]): boolean =>
  def.surfaces.some((surface) => surface.in === place);

// in the order they are checked; the first that holds refuses the definition
const REFUSALS: readonly (readonly [
  RegistryErrorCode,
  (def: SettingDefinition) => boolean,
])[] = [
  ["bad_default", (def) => !def.type.parse(def.default).ok],
  ["no_surface", (def) => def.surfaces.length === 0],
  ["boot_not_attribute", (def) => def.boot && def.apply.how !== "attribute"],
  [
    "preference_on_layout",
    (def) =>
      isPreference(def) &&
      def.apply.how === "editor" &&
      def.apply.effect === "layout",
  ],
  [
    "preference_off_preferences",
    (def) => isPreference(def) && isShownIn(def, "scriptSettings"),
  ],
  [
    "shared_on_preferences",
    (def) => def.scope === "script" && isShownIn(def, "preferences"),
  ],
];

function refusalOf(
  def: SettingDefinition,
  seen: ReadonlyMap<string, unknown>,
  retired: ReadonlySet<string>,
): RegistryErrorCode | null {
  if (!KEY_PATTERN.test(def.key)) return "bad_key";
  if (seen.has(def.key)) return "duplicate_key";
  if (retired.has(def.key)) return "retired_key";
  return REFUSALS.find(([, refuses]) => refuses(def))?.[0] ?? null;
}

/** The registry of `definitions`. Throws RegistryError for the first definition it refuses. */
export function createRegistry<const D extends readonly SettingDefinition[]>(
  definitions: D,
  retired: readonly string[],
  pointers: readonly SearchPointer[],
): SettingsRegistry<D> {
  const retiredKeys: ReadonlySet<string> = new Set(retired);
  const byKey = new Map<string, D[number]>();
  for (const def of definitions) {
    const code = refusalOf(def, byKey, retiredKeys);
    if (code !== null) throw new RegistryError(code, def.key);
    byKey.set(def.key, def);
  }
  return Object.freeze({
    all: definitions,
    get(key: D[number]["key"]): D[number] {
      const def = byKey.get(key);
      if (def === undefined)
        throw new RangeError(`no setting is registered as ${key}`);
      return def;
    },
    byScope: (scope: Scope): readonly SettingDefinition[] =>
      definitions.filter((def) => def.scope === scope),
    bySurface: (place: Surface["in"]): readonly SettingDefinition[] =>
      definitions.filter((def) => isShownIn(def, place)),
    pointers,
    retired: retiredKeys,
  });
}
