// The events a session tells on a document's handle for the frames it relays as they came.
import type { DocumentMessage } from "@manent/sync-protocol";
import type { DocEvent } from "./doc-handle.ts";

/** The event a frame for the document is heard as on its handle; null for a frame that is heard as none. */
export function toDocEvent(message: DocumentMessage): DocEvent | null {
  if (message.type === "CONTROL")
    return { type: "control", kind: message.kind, data: message.data };
  if (message.type !== "SUBSCRIBED") return null;
  const { lockLevel, lockAnchors, revision } = message;
  const table = lockAnchors !== null && "table" in lockAnchors;
  return {
    type: "subscribed",
    lockLevel,
    lockAnchors: table ? lockAnchors.table : null,
    revision,
  };
}
