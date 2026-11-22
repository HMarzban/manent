// What others do to a script's history, said in the message slot: a restore, with its time and a way to see what
// changed, and a draft they named. A version made is only listed.
import type { DocHandle } from "@manent/sync-client";
import type { HistoryControl } from "@manent/sync-protocol";
import { formatTime, historyMessage, versionRef } from "@manent/ui";
import type { HistoryMessage, MessageQueue } from "@manent/ui";
import { isInstant, isRecord, isText, isTextOrNull } from "./bodies.ts";

const CONTROL_KINDS: readonly HistoryControl["kind"][] = [
  "version_created",
  "draft_named",
  "restored",
];

/** A CONTROL frame's data about history; null for one this build cannot read. */
function readControl(data: Uint8Array): HistoryControl | null {
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(data));
  } catch {
    // a frame that is not JSON says nothing this build can show
    return null;
  }
  if (!isRecord(body)) return null;
  const {
    kind,
    versionId,
    userId,
    at,
    name,
    versionAt,
    scene,
    beforeVersionId,
  } = body;
  const known = CONTROL_KINDS.find((k) => k === kind);
  if (
    known === undefined ||
    !isText(versionId) ||
    !isText(userId) ||
    !isInstant(at) ||
    !isTextOrNull(name) ||
    !isInstant(versionAt) ||
    !isTextOrNull(scene) ||
    !isTextOrNull(beforeVersionId)
  )
    return null;
  return {
    kind: known,
    versionId,
    userId,
    at,
    name,
    versionAt,
    scene,
    beforeVersionId,
  };
}

// the restores of others whose messages may still be queued; the oldest is forgotten first
const SEEN_KEPT = 16;

/** What "See what changed" opens, by the id of the message that carries it. */
const seen = new Map<
  string,
  { docId: string; beforeVersionId: string; at: number }
>();

/** The baseline of the message `messageId`; null for a message that carries none. */
export function whatChanged(
  messageId: string,
): { docId: string; beforeVersionId: string; at: number } | null {
  return seen.get(messageId) ?? null;
}

function messageOf(
  control: HistoryControl,
  nameOf: (userId: string) => string,
): HistoryMessage | null {
  const name = nameOf(control.userId);
  if (control.kind === "draft_named")
    return control.name === null
      ? null
      : { kind: "named_by_other", name, draft: control.name };
  if (control.kind !== "restored") return null;
  const ref = versionRef(
    {
      kind: "auto",
      name: control.name,
      createdByUserId: control.userId,
      createdAt: control.versionAt,
      onDevice: false,
    },
    nameOf,
  );
  const time = formatTime(control.at);
  return control.scene === null
    ? { kind: "restored_by", name, ref, time }
    : { kind: "restored_scene_by", name, scene: control.scene, ref, time };
}

/** Says in `messages` each restore and named draft of someone else's on `handle`'s script; the returned function stops. */
export function historyEvents(options: {
  handle: DocHandle;
  messages: MessageQueue;
  nameOf(userId: string): string;
  viewerUserId: string;
}): () => void {
  const { handle, messages } = options;
  return handle.on((event) => {
    if (event.type !== "control") return;
    const control = readControl(event.data);
    if (control === null || control.userId === options.viewerUserId) return;
    const message = messageOf(control, options.nameOf);
    if (message === null) return;
    const id =
      control.beforeVersionId === null
        ? `history.${message.kind}`
        : `history.${message.kind}.${control.beforeVersionId}`;
    if (control.beforeVersionId !== null) {
      seen.set(id, {
        docId: handle.docId,
        beforeVersionId: control.beforeVersionId,
        at: control.at,
      });
      const [oldest] = seen.keys();
      if (seen.size > SEEN_KEPT && oldest !== undefined) seen.delete(oldest);
    }
    messages.push(historyMessage(message, id));
  });
}
