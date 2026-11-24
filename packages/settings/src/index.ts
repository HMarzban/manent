// The typed settings registry: definitions, validation, resolution and the store.
export { MENU_IDS, PROJECT_GROUPS, SCRIPT_GROUPS, SECTION_IDS } from "./ids.ts";
export type { MenuId, ProjectGroup, ScriptGroup, SectionId } from "./ids.ts";
export { t } from "./types.ts";
export type {
  Apply,
  Choice,
  ElementStyle,
  ElementStyles,
  HeaderSlot,
  HeaderSlots,
  ParseResult,
  Platform,
  Scope,
  SettingDefinition,
  SettingType,
  Surface,
} from "./types.ts";
export { setting } from "./define.ts";
export {
  REGISTRY_ERROR_CODES,
  RegistryError,
  createRegistry,
} from "./registry.ts";
export type {
  RegistryErrorCode,
  SearchPointer,
  SettingsRegistry,
} from "./registry.ts";
export { UNSET, createSettingsStore } from "./store.ts";
export type {
  Bag,
  Explained,
  Hold,
  Provenance,
  ResetReceipt,
  SetResult,
  SettingKey,
  SettingValue,
  SettingsStore,
} from "./store.ts";
export { entryKey, latestEntries } from "./personal-entries.ts";
export type { PrefEntry } from "./personal-entries.ts";
export { createMemoryBag, createPersonalBag } from "./bags.ts";
export type { KeyValueMap } from "./bags.ts";
export {
  FOLLOWED_SCRIPT_KEYS,
  isFollowedProjectKeySet,
  projectTwinOf,
  resolveFollowed,
  scriptTwinOf,
} from "./project-follow.ts";
export { PREFERENCE_LIST, RETIRED_KEYS, SETTINGS } from "./settings.ts";
export { POINTERS } from "./definitions/pointers.ts";
export { appliesToFormat, paperForRegion } from "./definitions/script.ts";
