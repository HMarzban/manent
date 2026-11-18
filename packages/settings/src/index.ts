// The typed settings registry: definitions, validation, resolution and the store.
export { MENU_IDS, SCRIPT_GROUPS, SECTION_IDS } from "./ids.ts";
export type { MenuId, ScriptGroup, SectionId } from "./ids.ts";
export { t } from "./types.ts";
export type {
  Apply,
  Choice,
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
