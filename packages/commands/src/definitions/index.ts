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
import { NAVIGATION_COMMANDS } from "./navigation.ts";
import { PRODUCTION_COMMANDS } from "./production.ts";
import { SYNC_COMMANDS } from "./sync.ts";
import { VIEW_COMMANDS } from "./view.ts";
import { COMMENTS_COMMANDS } from "./comments.ts";
import { WRITING_COMMANDS } from "./writing.ts";
import { ASSIGNMENT_COMMANDS } from "./assignment.ts";
import { MATERIAL_COMMANDS } from "./material.ts";
import { SCENES_COMMANDS } from "./scenes.ts";
import { ROOM_COMMANDS } from "./room.ts";
import { SHARE_COMMANDS } from "./share.ts";
import { DRAFTS_COMMANDS } from "./drafts.ts";
import { LINKS_COMMANDS } from "./links.ts";
import { PROJECT_COMMANDS } from "./project.ts";
import { SERIES_COMMANDS } from "./series.ts";
import { NAMES_COMMANDS } from "./names.ts";
import { CHECKS_COMMANDS } from "./checks.ts";
import { BOARD_COMMANDS } from "./board.ts";
import { OUTLINE_COMMANDS } from "./outline.ts";
import { ROOM_LOG_COMMANDS } from "./room-log.ts";
import { COPIES_COMMANDS } from "./copies.ts";
import { READER_COMMANDS } from "./reader.ts";
import { BESIDE_COMMANDS } from "./beside.ts";
import { ARCHIVE_COMMANDS } from "./archive.ts";
import { TIMING_COMMANDS } from "./timing.ts";
import { RUNDOWN_COMMANDS } from "./rundown.ts";
import { PROMPTER_COMMANDS } from "./prompter.ts";
import { LIBRARY_FILES_COMMANDS } from "./library-files.ts";
import { SEARCH_COMMANDS } from "./search.ts";
import { WORKSPACE_COMMANDS } from "./workspace.ts";
import { ACCOUNT_COMMANDS } from "./account.ts";
import { INK_COMMANDS } from "./ink.ts";

export const COMMANDS = defineCommands([
  ...APP_COMMANDS,
  ...EDIT_COMMANDS,
  ...VIEW_COMMANDS,
  ...DOCUMENT_COMMANDS,
  ...EDITOR_COMMANDS,
  ...NAVIGATION_COMMANDS,
  ...LIBRARY_COMMANDS,
  ...IMPORT_COMMANDS,
  ...SYNC_COMMANDS,
  ...DEMO_COMMANDS,
  ...DESKTOP_COMMANDS,
  ...HISTORY_COMMANDS,
  ...PRODUCTION_COMMANDS,
  ...COMMENTS_COMMANDS,
  ...WRITING_COMMANDS,
  ...ASSIGNMENT_COMMANDS,
  ...MATERIAL_COMMANDS,
  ...SCENES_COMMANDS,
  ...ROOM_COMMANDS,
  ...SHARE_COMMANDS,
  ...DRAFTS_COMMANDS,
  ...LINKS_COMMANDS,
  ...PROJECT_COMMANDS,
  ...SERIES_COMMANDS,
  ...NAMES_COMMANDS,
  ...CHECKS_COMMANDS,
  ...BOARD_COMMANDS,
  ...OUTLINE_COMMANDS,
  ...ROOM_LOG_COMMANDS,
  ...COPIES_COMMANDS,
  ...READER_COMMANDS,
  ...BESIDE_COMMANDS,
  ...ARCHIVE_COMMANDS,
  ...TIMING_COMMANDS,
  ...RUNDOWN_COMMANDS,
  ...PROMPTER_COMMANDS,
  ...LIBRARY_FILES_COMMANDS,
  ...SEARCH_COMMANDS,
  ...WORKSPACE_COMMANDS,
  ...ACCOUNT_COMMANDS,
  ...INK_COMMANDS,
  ...settingCommands(SETTINGS),
]);
export type CommandId = (typeof COMMANDS)[number]["id"];

/** One handler per command; a generated setting command needs none, because the service sets its value. */
export type CommandHandlers = {
  readonly [Id in Exclude<CommandId, `setting.${string}`>]: () => void;
};
