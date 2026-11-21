// A script whose first sync the server refused says why, once, and offers Export.
import type { DocHandle, HandoffRefusal } from "@manent/sync-client";
import { DESKTOP_WORDS } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";

/**
 * Pushes one message for each document of `handles()` whose upstream status first carries a refused hand-off, and once
 * only per document and refusal. The returned function stops.
 */
export function watchHandoffRefusals(options: {
  handles: () => readonly DocHandle[];
  title: (docId: string) => string;
  queue: MessageQueue;
}): () => void {
  const { title, queue } = options;
  const said = new Set<string>();
  const sayOnce = (docId: string, refusal: HandoffRefusal): void => {
    const key = `${docId} ${refusal}`;
    if (said.has(key)) return;
    said.add(key);
    queue.push({
      id: "handoff_refused",
      text: DESKTOP_WORDS.handoffRefused(
        title(docId),
        DESKTOP_WORDS.handoffReason[refusal],
      ),
      actions: [{ label: "Export", commandId: "doc.export" }],
      lifetime: "until_dismissed",
      ownWork: true,
    });
  };
  const follow = (handle: DocHandle): (() => void) => {
    const read = (): void => {
      const refusal = handle.upstream.get()?.handoffRefused ?? null;
      if (refusal !== null) sayOnce(handle.docId, refusal);
    };
    read();
    return handle.upstream.subscribe(read);
  };
  const stops = options.handles().map(follow);
  return () => {
    for (const stop of stops) stop();
  };
}
