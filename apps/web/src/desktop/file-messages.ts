// The files the shell was asked to open: each it read goes to the person's file opener, each it refused is said in a brief message.
import type { MessageQueue } from "@manent/ui";
import type { DesktopHost } from "./host.ts";

/** Answers each `files_opened` once its answer has loaded, apart from the first load; the returned function stops. */
export function watchRefusedFiles(options: {
  host: DesktopHost;
  queue: MessageQueue;
}): () => void {
  const { host, queue } = options;
  return host.onMessage((message) => {
    if (message.t !== "files_opened") return;
    void import("./opened-files.ts").then(({ answerFilesOpened }) =>
      answerFilesOpened(queue, message),
    );
  });
}
