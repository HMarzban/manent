// The files the shell was asked to open and refused, each said in a brief message.
import type { FileRefusal } from "@manent/sync-protocol";
import { DESKTOP_WORDS } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import type { DesktopHost } from "./host.ts";

const REFUSAL_WORDS: Readonly<Record<FileRefusal, (name: string) => string>> =
  Object.freeze({
    type: DESKTOP_WORDS.fileWrongType,
    size: DESKTOP_WORDS.fileTooLarge,
  });

/** Pushes one brief message per file of each `files_opened` the shell refused, in its order; the returned function stops. */
export function watchRefusedFiles(options: {
  host: DesktopHost;
  queue: MessageQueue;
}): () => void {
  const { host, queue } = options;
  return host.onMessage((message) => {
    if (message.t !== "files_opened") return;
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
