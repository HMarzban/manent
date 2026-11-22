// The system's dialogs: the one alert, for scripts a newer build wrote, and the chooser for files to open.
import { basename } from "node:path";
import {
  OPENED_FILE_EXTENSIONS,
  OPENED_FILE_LIMIT_BYTES,
} from "@manent/sync-protocol";
import type { FileRefusal, OpenedFile } from "@manent/sync-protocol";
import { SHELL_WORDS } from "../words.ts";
import { Utils } from "./sdk.ts";

/** The shell channel carries at most this many files, and as many refusals, in one message. */
const OPENED_FILES_LIMIT = 32;

/**
 * The alert for a store a newer build wrote: its default button opens the repository's latest
 * release in the system browser. Resolves once the person has answered.
 */
export async function alertNewerStore(repository: string): Promise<void> {
  const { response } = await Utils.showMessageBox({
    type: "warning",
    title: SHELL_WORDS.newerStoreTitle,
    message: SHELL_WORDS.newerStoreBody,
    buttons: [SHELL_WORDS.getLatest, SHELL_WORDS.quit],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0)
    Utils.openExternal(`https://github.com/${repository}/releases/latest`);
}

const isOpenable = (name: string): boolean =>
  OPENED_FILE_EXTENSIONS.some((extension) =>
    name.toLowerCase().endsWith(extension),
  );

/** Why the file at `path` is not opened; null when it is. */
function refusalOf(path: string): FileRefusal | null {
  if (!isOpenable(path)) return "type";
  return Bun.file(path).size > OPENED_FILE_LIMIT_BYTES ? "size" : null;
}

/** Asks the person for files to open; each is read, or refused for its type or its size. */
export async function chooseFiles(): Promise<{
  files: OpenedFile[];
  refused: { name: string; reason: FileRefusal }[];
}> {
  const paths = await Utils.openFileDialog({
    allowedFileTypes: OPENED_FILE_EXTENSIONS.map((e) => e.slice(1)).join(","),
    canChooseFiles: true,
    canChooseDirectory: false,
    allowsMultipleSelection: true,
  });
  const files: OpenedFile[] = [];
  const refused: { name: string; reason: FileRefusal }[] = [];
  for (const path of paths) {
    const name = basename(path);
    const reason = refusalOf(path);
    if (reason !== null) {
      if (refused.length < OPENED_FILES_LIMIT) refused.push({ name, reason });
    } else if (files.length < OPENED_FILES_LIMIT) {
      const bytes = await Bun.file(path).bytes();
      files.push({ name, bytes: bytes.toBase64() });
    }
  }
  return { files, refused };
}
