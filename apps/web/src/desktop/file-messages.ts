// The files the shell was asked to open: each it read goes to the person's file opener, each it refused is said in a brief message.
import type { FileRefusal, OpenedFile } from "@manent/sync-protocol";
import { IMPORT_WORDS } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import { IMPORTABLE_EXTENSIONS } from "../import/readers.ts";
import type { ImportFile } from "../import/open-files.ts";
import type { DesktopHost } from "./host.ts";

const REFUSAL_WORDS: Readonly<Record<FileRefusal, (name: string) => string>> =
  Object.freeze({
    type: (name) => IMPORT_WORDS.notImportable(name, IMPORTABLE_EXTENSIONS),
    size: IMPORT_WORDS.tooLarge,
  });

const toImportFile = ({ name, bytes }: OpenedFile): ImportFile => ({
  name,
  bytes: Uint8Array.fromBase64(bytes),
});

/**
 * For each `files_opened`, hands the files the shell read to `fileOpener()`, as a drop does, and pushes one brief
 * message per file it refused, in its order; the returned function stops.
 */
export function watchRefusedFiles(options: {
  host: DesktopHost;
  queue: MessageQueue;
}): () => void {
  const { host, queue } = options;
  return host.onMessage((message) => {
    if (message.t !== "files_opened") return;
    if (message.files.length > 0) {
      const files = message.files.map(toImportFile);
      void import("../import/open-files.ts").then(({ fileOpener }) =>
        fileOpener()?.open(files),
      );
    }
    for (const { name, reason } of message.refused)
      queue.push({
        id: "file_refused",
        text: REFUSAL_WORDS[reason](name),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      });
  });
}
