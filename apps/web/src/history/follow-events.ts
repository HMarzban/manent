// What others do to the history of each open script, said in the message slot while the script is open.
import type { DocHandle } from "@manent/sync-client";
import type { MessageQueue } from "@manent/ui";
import type { DocumentSource } from "../services/ports.ts";

const noop = (): void => {};

/** `source`, with each script's history followed from its first open to its last close. */
export function followHistoryEvents(
  source: DocumentSource,
  options: {
    open: (docId: string) => Promise<DocHandle>;
    messages: MessageQueue;
    userId: string;
  },
): DocumentSource {
  const followed = new Map<
    string,
    { opens: number; stop: Promise<() => void> }
  >();

  async function follow(docId: string): Promise<() => void> {
    const [handle, { historyEvents }, { nameOf }] = await Promise.all([
      options.open(docId),
      import("./history-events.ts"),
      import("../services/sync/index-entries.ts"),
    ]);
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

  return {
    open(docId) {
      const entry = followed.get(docId);
      if (entry === undefined)
        followed.set(docId, {
          opens: 1,
          // a script whose sync never started has no history to follow
          stop: follow(docId).catch(() => noop),
        });
      else entry.opens++;
      return source.open(docId);
    },
    close(docId) {
      const entry = followed.get(docId);
      if (entry !== undefined && --entry.opens === 0) {
        followed.delete(docId);
        void entry.stop.then((stop) => stop());
      }
      source.close(docId);
    },
  };
}
