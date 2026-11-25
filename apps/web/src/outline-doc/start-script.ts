// Runs Start script from outline: copies the outline's beats into an empty script in one undoable transaction.
import { randomBlockId } from "@manent/schema";
import { OUTLINE_WORDS, messageFor } from "@manent/ui";
import { liveEditor } from "../editor-host/live-editor.ts";
import type { PersonServices } from "../services/ports.ts";
import { outlineStartActions } from "../state/outline-start.store.ts";
import {
  applyOutlineToScript,
  extractOutlineBeats,
  isDocEmpty,
} from "./beats.ts";
import { resolveOutlineDocId } from "./outline-link.ts";

function unavailable(services: PersonServices): void {
  services.messages.push(
    messageFor({
      kind: "command_unavailable",
      label: OUTLINE_WORDS.startScript,
      reason: OUTLINE_WORDS.startReason,
    }),
  );
}

/** Verifies the person has write access to `docId` before mutating it. */
async function canWriteScript(
  services: PersonServices,
  docId: string,
): Promise<boolean> {
  const editor = liveEditor(docId);
  if (editor !== null && !editor.editable) return false;
  const doc = services.documents.open(docId);
  let accessOk: boolean;
  try {
    const facts = doc.status.get();
    accessOk = facts.access === "edit" && facts.server !== "access_removed";
  } finally {
    services.documents.close(docId);
  }
  if (!accessOk) return false;
  const role = await services.api.role(docId);
  return role !== "view" && role !== "comment";
}

/**
 * Turns the beats of `docId`'s outline into Scene Headings with their synopses in `docId` in one undoable step, and
 * posts the reverse Undo message. Refuses cleanly when the user lacks write access, the script is non-empty, or the
 * outline has no beats.
 */
export async function startScriptFromOutline(
  services: PersonServices,
  docId: string,
): Promise<number> {
  const docKind = services.library.docKindOf(docId).get();
  if (docKind !== null && docKind !== "script") {
    unavailable(services);
    return 0;
  }
  if (!(await canWriteScript(services, docId))) {
    unavailable(services);
    return 0;
  }
  const outlineDocId =
    outlineStartActions.entryOf(docId)?.outlineDocId ??
    (await resolveOutlineDocId(services, docId));
  if (outlineDocId === null) {
    unavailable(services);
    return 0;
  }
  let scriptDoc = liveEditor(docId)?.doc ?? null;
  if (scriptDoc === null) {
    try {
      scriptDoc = (await services.openHandle(docId)).doc();
    } catch {
      // script handle unavailable
      unavailable(services);
      return 0;
    }
  }
  let outlineDoc = liveEditor(outlineDocId)?.doc ?? null;
  if (outlineDoc === null) {
    try {
      outlineDoc = (await services.openHandle(outlineDocId)).doc();
    } catch {
      // outline handle unavailable
      unavailable(services);
      return 0;
    }
  }
  if (!isDocEmpty(scriptDoc) || extractOutlineBeats(outlineDoc).length === 0) {
    unavailable(services);
    return 0;
  }
  const count = applyOutlineToScript(scriptDoc, outlineDoc, randomBlockId);
  if (count === 0) {
    unavailable(services);
    return 0;
  }
  services.messages.push({
    id: "outline_started",
    text: OUTLINE_WORDS.started(count),
    actions: [{ label: OUTLINE_WORDS.undo, commandId: "edit.undo" }],
    lifetime: "reverse",
    ownWork: false,
  });
  return count;
}
