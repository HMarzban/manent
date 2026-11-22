// What the shell's files_opened does. It loads apart from the first load, beside the file opener it imports: loaded
// without the opener, the import's words it says are bundled into the first load's entry.
import type {
  FileRefusal,
  OpenedFile,
  ShellMessage,
} from "@manent/sync-protocol";
import { IMPORT_WORDS } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import { fileOpener } from "../import/open-files.ts";
import type { ImportFile } from "../import/open-files.ts";
import { IMPORTABLE_EXTENSIONS } from "../import/readers.ts";

const REFUSAL_WORDS: Readonly<Record<FileRefusal, (name: string) => string>> =
  Object.freeze({
    type: (name) => IMPORT_WORDS.notImportable(name, IMPORTABLE_EXTENSIONS),
    size: IMPORT_WORDS.tooLarge,
  });

const toImportFile = ({ name, bytes }: OpenedFile): ImportFile => ({
  name,
  bytes: Uint8Array.fromBase64(bytes),
});

/** Pushes one brief message per file the shell refused, in its order, then hands the files it read to `fileOpener()`, as a drop does. */
export function answerFilesOpened(
  queue: MessageQueue,
  message: Extract<ShellMessage, { t: "files_opened" }>,
): void {
  for (const { name, reason } of message.refused)
    queue.push({
      id: "file_refused",
      text: REFUSAL_WORDS[reason](name),
      actions: [],
      lifetime: "brief",
      ownWork: false,
    });
  if (message.files.length > 0)
    void fileOpener()?.open(message.files.map(toImportFile));
}
