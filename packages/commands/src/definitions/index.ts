// Every command of this release, declared once: the menus, the palette and the shortcuts are generated from this list.
import { SETTINGS } from "@manent/settings";
import { defineCommands } from "../define.ts";
import { settingCommands } from "../settings-commands.ts";
import { APP_COMMANDS } from "./app.ts";
import { DEMO_COMMANDS } from "./demo.ts";
import { DESKTOP_COMMANDS } from "./desktop.ts";
import { DOCUMENT_COMMANDS } from "./document.ts";
import { EDIT_COMMANDS } from "./edit.ts";
import { EDITOR_COMMANDS } from "./editor.ts";
import { HISTORY_COMMANDS } from "./history.ts";
import { IMPORT_COMMANDS } from "./import.ts";
import { LIBRARY_COMMANDS } from "./library.ts";
import { PRODUCTION_COMMANDS } from "./production.ts";
import { SYNC_COMMANDS } from "./sync.ts";
import { VIEW_COMMANDS } from "./view.ts";

export const COMMANDS = defineCommands([
  ...APP_COMMANDS,
  ...EDIT_COMMANDS,
  ...VIEW_COMMANDS,
  ...DOCUMENT_COMMANDS,
  ...EDITOR_COMMANDS,
  ...LIBRARY_COMMANDS,
  ...IMPORT_COMMANDS,
  ...SYNC_COMMANDS,
  ...DEMO_COMMANDS,
  ...DESKTOP_COMMANDS,
  ...HISTORY_COMMANDS,
  ...PRODUCTION_COMMANDS,
  ...settingCommands(SETTINGS),
]);
export type CommandId = (typeof COMMANDS)[number]["id"];

/** One handler per command; a generated setting command needs none, because the service sets its value. */
export type CommandHandlers = {
  readonly [Id in Exclude<CommandId, `setting.${string}`>]: () => void;
};
