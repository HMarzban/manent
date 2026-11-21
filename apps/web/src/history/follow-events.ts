// What others do to the history of an open script, said in the message slot while the script is open.
import type { DocHandle } from "@manent/sync-client";
import type { MessageQueue } from "@manent/ui";
import { nameOf } from "../services/sync/index-entries.ts";
import { historyEvents } from "./history-events.ts";

/** Follows `docId`'s history through a handle of its own; the returned function stops following and closes the handle. */
export async function followHistoryEvents(
  docId: string,
  options: {
    open: (docId: string) => Promise<DocHandle>;
    messages: MessageQueue;
    userId: string;
  },
): Promise<() => void> {
  const handle = await options.open(docId);
  const stop = historyEvents({
    handle,
    messages: options.messages,
    nameOf,
    viewerUserId: options.userId,
  });
  return () => {
    stop();
    void handle.close();
  };
}
