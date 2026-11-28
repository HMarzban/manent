// Pitch helpers: find the dialogue block holding the driver's caret, and append one pitched alternate.
import { addAlternate } from "@manent/crdt";
import { randomBlockId } from "@manent/schema";
import { liveEditor } from "../editor-host/live-editor.ts";

/** The dialogue block id for `driverUserId`'s latest caret, or null when their caret is outside a speech. */
export function driverSpeechBlockId(
  docId: string,
  driverUserId: string,
): string | null {
  const live = liveEditor(docId);
  if (live === null) return null;
  let latestMovedAt = -1;
  let headBlockId: string | null = null;
  for (const cursor of live.remoteCursors?.() ?? []) {
    if (cursor.userId !== driverUserId) continue;
    if (cursor.movedAt >= latestMovedAt) {
      latestMovedAt = cursor.movedAt;
      headBlockId = cursor.place.head.blockId;
    }
  }
  if (headBlockId === null) return null;

  let inSpeechHead = false;
  const { doc } = live.view.state;
  for (let s = 0; s < doc.childCount; s++) {
    const section = doc.child(s);
    for (let b = 0; b < section.childCount; b++) {
      const block = section.child(b);
      const id: unknown = block.attrs.id;
      const type: unknown = block.attrs.type;
      const blockId = typeof id === "string" ? id : null;
      const blockType = typeof type === "string" ? type : null;
      if (!inSpeechHead) {
        if (blockId !== headBlockId) continue;
        if (blockType === "dialogue") return blockId;
        if (blockType !== "character" && blockType !== "parenthetical")
          return null;
        inSpeechHead = true;
        continue;
      }
      if (blockType === "dialogue") return blockId;
      if (blockType !== "parenthetical") return null;
    }
  }
  return null;
}

export function canPitchInEditor(docId: string): boolean {
  const live = liveEditor(docId);
  return live !== null && live.editable;
}

/** Appends one pitched alternate as a single undo step of the pitcher's. Returns true if written. */
export function submitPitch(options: {
  docId: string;
  blockId: string;
  text: string;
  authorUserId: string;
}): boolean {
  const trimmed = options.text.trim();
  if (trimmed.length === 0) return false;
  const live = liveEditor(options.docId);
  if (live === null || !live.editable) return false;
  addAlternate(live.doc, {
    blockId: options.blockId,
    text: trimmed,
    authorUserId: options.authorUserId,
    pitched: true,
    now: () => Date.now(),
    ids: randomBlockId,
  });
  return true;
}
