// The system's dialogs: the one alert, for scripts a newer build wrote, the chooser for files to open, and the folder chooser.
import { basename } from "node:path";
import {
  OPENED_FILE_EXTENSIONS,
  OPENED_FILE_LIMIT_BYTES,
} from "@manent/sync-protocol";
import type { FileRefusal, OpenedFile } from "@manent/sync-protocol";
import { SHELL_WORDS } from "../words.ts";

/** The shell channel carries at most this many files, and as many refusals, in one message. */
const OPENED_FILES_LIMIT = 32;

export interface OpenedFilesResult {
  files: OpenedFile[];
  refused: { name: string; reason: FileRefusal }[];
}

export interface DialogUtils {
  showMessageBox(options: {
    type: "warning";
    title: string;
    message: string;
    buttons: string[];
    defaultId: number;
    cancelId: number;
  }): Promise<{ response: number }>;
  openExternal(url: string): void;
  openFileDialog(options: {
    allowedFileTypes?: string;
    canChooseFiles: boolean;
    canChooseDirectory: boolean;
    allowsMultipleSelection: boolean;
  }): Promise<string[]>;
}

/**
 * The alert for a store a newer build wrote: its default button opens the repository's latest
 * release in the system browser. Resolves once the person has answered.
 */
export async function alertNewerStore(
  repository: string,
  utils: DialogUtils,
): Promise<void> {
  const { response } = await utils.showMessageBox({
    type: "warning",
    title: SHELL_WORDS.newerStoreTitle,
    message: SHELL_WORDS.newerStoreBody,
    buttons: [SHELL_WORDS.getLatest, SHELL_WORDS.quit],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0)
    utils.openExternal(`https://github.com/${repository}/releases/latest`);
}

const isOpenable = (name: string): boolean =>
  OPENED_FILE_EXTENSIONS.some((extension) =>
    name.toLowerCase().endsWith(extension),
  );

/**
 * Reads `paths` for the page, applying the shared extension filter, 32 MB limit and 32-file cap.
 * Used by both the file chooser dialog and OS `file://` open-url events.
 */
export async function readOpenedPaths(
  paths: readonly string[],
): Promise<OpenedFilesResult> {
  const files: OpenedFile[] = [];
  const refused: { name: string; reason: FileRefusal }[] = [];
  for (const path of paths) {
    if (path === "") continue;
    const name = basename(path);
    if (!isOpenable(path)) {
      if (refused.length < OPENED_FILES_LIMIT)
        refused.push({ name, reason: "type" });
      continue;
    }
    const file = Bun.file(path);
    let size: number;
    try {
      const info = await file.stat();
      if (!info.isFile()) continue;
      size = info.size;
    } catch {
      continue;
    }
    if (size > OPENED_FILE_LIMIT_BYTES) {
      if (refused.length < OPENED_FILES_LIMIT)
        refused.push({ name, reason: "size" });
      continue;
    }
    if (files.length < OPENED_FILES_LIMIT) {
      try {
        const bytes = await file.bytes();
        files.push({ name, bytes: bytes.toBase64() });
      } catch {
        continue;
      }
    }
  }
  return { files, refused };
}

/** Asks the person for files to open; each is read, or refused for its type or its size. */
export async function chooseFiles(
  utils: DialogUtils,
): Promise<OpenedFilesResult> {
  const paths = await utils.openFileDialog({
    allowedFileTypes: OPENED_FILE_EXTENSIONS.map((e) => e.slice(1)).join(","),
    canChooseFiles: true,
    canChooseDirectory: false,
    allowsMultipleSelection: true,
  });
  return readOpenedPaths(paths);
}

/** Asks the person for a folder; null when the dialog is cancelled. */
export async function chooseDirectory(
  utils: DialogUtils,
): Promise<string | null> {
  const paths = await utils.openFileDialog({
    canChooseFiles: false,
    canChooseDirectory: true,
    allowsMultipleSelection: false,
  });
  const first = paths[0];
  return first === undefined || first === "" ? null : first;
}
