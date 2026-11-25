// The shell channel: what the desktop page and its shell say to each other, and the values the page starts with.
import { isDocId } from "./doc-id.ts";
import { isBase64 } from "./http.ts";

export const DESKTOP_PROTOCOL_VERSION = 1;

export const NATIVE_MENU_IDS = [
  "app",
  "file",
  "edit",
  "view",
  "format",
  "script",
  "production",
  "window",
  "help",
] as const;
export type NativeMenuId = (typeof NATIVE_MENU_IDS)[number];

export const NATIVE_ROLES = ["cut", "copy", "paste", "selectAll"] as const;
export type NativeRole = (typeof NATIVE_ROLES)[number];

export interface NativeMenuItem {
  id: string;
  label: string;
  enabled: boolean;
  checked: boolean | null;
  /** One key that Command (macOS) or Control (Windows) completes: "k", ",", "/"; null for none. */
  accelerator: string | null;
  role: NativeRole | null;
  /** The model's submenu: the items of one submenu are contiguous in their group, drawn as one submenu entry. */
  submenu: string | null;
}

export interface NativeMenu {
  menu: NativeMenuId;
  label: string;
  groups: NativeMenuItem[][];
}

/** An attribute and its value, as the web app's boot cache writes it. */
export type FirstPaintWrite = readonly ["a", string, string | null];

const WINDOW_ROLES = ["room", "prompter"] as const;
const ENCODINGS = ["utf-8", "windows-1252"] as const;

export type PageMessage =
  | { v: 1; t: "menus"; menus: NativeMenu[] }
  | { v: 1; t: "first_frame" }
  | { v: 1; t: "first_paint"; writes: FirstPaintWrite[] }
  | { v: 1; t: "open_in_browser" }
  | { v: 1; t: "open_files" }
  /** The system's file manager on the data directory. */
  | { v: 1; t: "show_folder" }
  | { v: 1; t: "check_for_updates" }
  /** The page's answer to `close_requested`. */
  | { v: 1; t: "close_answer"; close: boolean }
  /** A window of `role` on the document; `userId` is the person named in its address, absent for none. */
  | {
      v: 1;
      t: "open_window";
      role: (typeof WINDOW_ROLES)[number];
      docId: string;
      userId?: string;
    }
  /** The system's folder chooser; the shell answers `directory_chosen`. */
  | { v: 1; t: "choose_directory" };

/** The prompter files written for one rundown. */
export interface PrompterFilesStatus {
  rundownId: string;
  path: string;
  encoding: (typeof ENCODINGS)[number];
  /** Characters the encoding cannot hold, written as a replacement. */
  replaced: number;
  failure: "unwritable" | null;
}

/** `bytes` is base64. */
export interface OpenedFile {
  name: string;
  bytes: string;
}

export const FILE_REFUSALS = ["type", "size"] as const;
export type FileRefusal = (typeof FILE_REFUSALS)[number];

export const UPDATE_STATES = [
  "checking",
  "up_to_date",
  "ready",
  "check_failed",
] as const;
export type UpdateState = (typeof UPDATE_STATES)[number];

export type ShellMessage =
  | { v: 1; t: "menu_command"; id: string }
  | {
      v: 1;
      t: "files_opened";
      files: OpenedFile[];
      refused: { name: string; reason: FileRefusal }[];
    }
  | { v: 1; t: "update_state"; state: UpdateState }
  /** The window is closing: the page answers within the shell's wait. */
  | { v: 1; t: "close_requested" }
  /** The answer to `choose_directory`: null when the person cancelled. */
  | { v: 1; t: "directory_chosen"; path: string | null }
  /** Sent each time prompter files start, are written, stop or fail; null once none are written. */
  | { v: 1; t: "prompter_files"; status: PrompterFilesStatus | null };

/** `window.manentDesktop`, set by the local node's boot script. */
export interface DesktopGlobal {
  v: 1;
  platform: "mac" | "windows" | "linux";
  version: string;
  channel: "stable" | "canary";
  dataDir: string;
}

export const OPENED_FILE_EXTENSIONS = [
  ".fdx",
  ".fountain",
  ".pdf",
  ".docx",
  ".ink",
  ".fdr",
  ".txt",
] as const;
/** The largest file the shell opens; a larger one is refused for its size. */
export const OPENED_FILE_LIMIT_BYTES = 32 * 1024 * 1024;

const PLATFORMS = ["mac", "windows", "linux"] as const;
const CHANNELS = ["stable", "canary"] as const;
const COMMAND_ID = /^[a-z][A-Za-z0-9._-]{0,127}$/;
const ACCELERATOR = new RegExp("^[a-z0-9,/[\\]]$");
const GROUPS_LIMIT = 64;
const ITEMS_LIMIT = 64;
const LABEL_LIMIT = 200;
const NAME_LIMIT = 255;
const DATA_DIR_LIMIT = 4096;
const FILES_LIMIT = 32;

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isText = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.length >= 1 && value.length <= limit;

const isOneOf = <T extends string>(
  list: readonly T[],
  value: unknown,
): value is T => list.some((member) => member === value);

const isCommandId = (value: unknown): value is string =>
  typeof value === "string" && COMMAND_ID.test(value);

/** Each entry read by `read`; null when `value` is not an array of at most `limit`, or any entry is refused. */
function listOf<T>(
  value: unknown,
  limit: number,
  read: (entry: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value) || value.length > limit) return null;
  const list: T[] = [];
  for (const entry of value) {
    const parsed = read(entry);
    if (parsed === null) return null;
    list.push(parsed);
  }
  return list;
}

function readItem(value: unknown): NativeMenuItem | null {
  if (!isFields(value)) return null;
  const { id, label, enabled, checked, accelerator, role, submenu } = value;
  if (!isCommandId(id) || !isText(label, LABEL_LIMIT)) return null;
  if (typeof enabled !== "boolean") return null;
  if (checked !== null && typeof checked !== "boolean") return null;
  if (
    accelerator !== null &&
    !(typeof accelerator === "string" && ACCELERATOR.test(accelerator))
  )
    return null;
  if (role !== null && !isOneOf(NATIVE_ROLES, role)) return null;
  if (submenu !== null && !isText(submenu, LABEL_LIMIT)) return null;
  return { id, label, enabled, checked, accelerator, role, submenu };
}

function readMenu(value: unknown): NativeMenu | null {
  if (!isFields(value)) return null;
  const { menu, label } = value;
  if (!isOneOf(NATIVE_MENU_IDS, menu) || !isText(label, LABEL_LIMIT))
    return null;
  const groups = listOf(value.groups, GROUPS_LIMIT, (group) =>
    listOf(group, ITEMS_LIMIT, readItem),
  );
  return groups === null ? null : { menu, label, groups };
}

function readWrite(value: unknown): FirstPaintWrite | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [kind, name, text] = value;
  if (kind !== "a" || typeof name !== "string") return null;
  if (text !== null && typeof text !== "string") return null;
  return [kind, name, text];
}

function readOpenWindow(value: Fields): PageMessage | null {
  const { role, docId, userId } = value;
  if (!isOneOf(WINDOW_ROLES, role) || !isDocId(docId)) return null;
  if (userId === undefined) return { v: 1, t: "open_window", role, docId };
  if (!isText(userId, NAME_LIMIT)) return null;
  return { v: 1, t: "open_window", role, docId, userId };
}

function readPage(t: unknown, value: Fields): PageMessage | null {
  switch (t) {
    case "menus": {
      const menus = listOf(value.menus, Infinity, readMenu);
      return menus === null ? null : { v: 1, t, menus };
    }
    case "first_paint": {
      const writes = listOf(value.writes, Infinity, readWrite);
      return writes === null ? null : { v: 1, t, writes };
    }
    case "close_answer":
      return typeof value.close === "boolean"
        ? { v: 1, t, close: value.close }
        : null;
    case "open_window":
      return readOpenWindow(value);
    case "first_frame":
    case "open_in_browser":
    case "open_files":
    case "show_folder":
    case "check_for_updates":
    case "choose_directory":
      return { v: 1, t };
  }
  return null;
}

function readFile(value: unknown): OpenedFile | null {
  if (!isFields(value)) return null;
  const { name, bytes } = value;
  return isText(name, NAME_LIMIT) && isBase64(bytes) ? { name, bytes } : null;
}

function readRefused(
  value: unknown,
): { name: string; reason: FileRefusal } | null {
  if (!isFields(value)) return null;
  const { name, reason } = value;
  return isText(name, NAME_LIMIT) && isOneOf(FILE_REFUSALS, reason)
    ? { name, reason }
    : null;
}

function readStatus(value: unknown): PrompterFilesStatus | null {
  if (!isFields(value)) return null;
  const { rundownId, path, encoding, replaced, failure } = value;
  if (!isDocId(rundownId) || !isText(path, DATA_DIR_LIMIT)) return null;
  if (!isOneOf(ENCODINGS, encoding)) return null;
  if (typeof replaced !== "number" || !Number.isSafeInteger(replaced))
    return null;
  if (replaced < 0 || (failure !== null && failure !== "unwritable"))
    return null;
  return { rundownId, path, encoding, replaced, failure };
}

function readShell(t: unknown, value: Fields): ShellMessage | null {
  switch (t) {
    case "menu_command":
      return isCommandId(value.id) ? { v: 1, t, id: value.id } : null;
    case "files_opened": {
      const files = listOf(value.files, FILES_LIMIT, readFile);
      const refused = listOf(value.refused, FILES_LIMIT, readRefused);
      return files === null || refused === null
        ? null
        : { v: 1, t, files, refused };
    }
    case "update_state":
      return isOneOf(UPDATE_STATES, value.state)
        ? { v: 1, t, state: value.state }
        : null;
    case "close_requested":
      return { v: 1, t };
    case "directory_chosen": {
      const { path } = value;
      return path === null || isText(path, DATA_DIR_LIMIT)
        ? { v: 1, t, path }
        : null;
    }
    case "prompter_files": {
      const { status } = value;
      if (status === null) return { v: 1, t, status };
      const read = readStatus(status);
      return read === null ? null : { v: 1, t, status: read };
    }
  }
  return null;
}

/** Null for anything that is not a page message of this version. */
export function parsePageMessage(value: unknown): PageMessage | null {
  if (!isFields(value) || value.v !== DESKTOP_PROTOCOL_VERSION) return null;
  return readPage(value.t, value);
}

/** Null for anything that is not a shell message of this version. */
export function parseShellMessage(value: unknown): ShellMessage | null {
  if (!isFields(value) || value.v !== DESKTOP_PROTOCOL_VERSION) return null;
  return readShell(value.t, value);
}

/** Null for anything that is not the startup values of this version. */
export function parseDesktopGlobal(value: unknown): DesktopGlobal | null {
  if (!isFields(value) || value.v !== DESKTOP_PROTOCOL_VERSION) return null;
  const { platform, version, channel, dataDir } = value;
  if (!isOneOf(PLATFORMS, platform) || !isOneOf(CHANNELS, channel)) return null;
  if (!isText(version, NAME_LIMIT) || !isText(dataDir, DATA_DIR_LIMIT))
    return null;
  return { v: 1, platform, version, channel, dataDir };
}
