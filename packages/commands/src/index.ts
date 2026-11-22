// The command registry: definitions, context, key bindings and the service.
export { ELEMENT_COMMAND_SLOTS } from "./element-slots.ts";
export {
  LEFT_TABS,
  PANEL_IDS,
  SCREEN_IDS,
  SIDE_TABS,
  SURFACE_IDS,
} from "./ids.ts";
export type { LeftTab, PanelId, ScreenId, SideTab, SurfaceId } from "./ids.ts";
export { breaksLayoutRules, isChord } from "./chord.ts";
export type { Chord, Keys, PlatformKeys } from "./chord.ts";
export type { CommandContext } from "./context.ts";
export { CommandsError, defineCommands } from "./define.ts";
export type {
  CommandDefinition,
  CommandScope,
  MenuPlacement,
  SettingReader,
  SettingWriter,
} from "./define.ts";
export { createCommandService } from "./service.ts";
export type {
  CommandService,
  CommandState,
  RunResult,
  RunSource,
} from "./service.ts";
export { menuModel } from "./menu.ts";
export type { MenuItemModel, MenuModel } from "./menu.ts";
export { BROWSER_ZOOM_KEYS, resolveBindings } from "./bindings.ts";
export type { CustomBinding, Findings, Resolved } from "./bindings.ts";
export { checkCapture } from "./capture.ts";
export type { CaptureVerdict } from "./capture.ts";
export { probeChords } from "./key-probe.ts";
export type { ProbedKey } from "./key-probe.ts";
export { RESERVED_KEYS } from "./reserved-keys.ts";
export type { ReservedKey } from "./reserved-keys.ts";
export { settingCommands } from "./settings-commands.ts";
export { COMMANDS } from "./definitions/index.ts";
export type { CommandHandlers, CommandId } from "./definitions/index.ts";
export { EDITOR_COMMANDS } from "./definitions/editor.ts";
export type { EditorCommandId } from "./definitions/editor.ts";
