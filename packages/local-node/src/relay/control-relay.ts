// The cloud's CONTROL frames that the node passes on to the windows holding a document: the kinds only the cloud sends.
import type { ControlKind } from "@manent/sync-protocol";
import type { Editor } from "./mirror.ts";

export const RELAYED_CONTROL_KINDS: readonly ControlKind[] = Object.freeze([
  "draft_sent",
  "draft_opened",
  "driver_changed",
  "handed_in",
  "sent_to_prompter",
  "trashed",
  "untrashed",
]);

/** Passes a CONTROL the cloud sent for `docId` to every window holding the document, when its kind is relayed. */
export function relayControl(
  editors: readonly Editor[],
  docId: string,
  control: { kind: ControlKind; data: Uint8Array },
): void {
  if (!RELAYED_CONTROL_KINDS.includes(control.kind)) return;
  for (const editor of editors)
    editor.control(docId, control.kind, control.data);
}
