// Dynamic-import navigation between the Ink player and the open Ink editor (keeps @manent/editor out of static chunks).
import type { EditorControl } from "../../editor-host/control.ts";

// Matches `=== knot_name ===` or `== knot_name` while excluding `=== function name(...) ===`.
const KNOT_HEADER = /^={2,}\s*(?!function\b)([A-Za-z_][A-Za-z0-9_]*)\b/;

/** Moves the open Ink editor's caret to the 1-based source line `line`. */
export async function jumpToInkLine(
  docId: string,
  line: number,
  editor: EditorControl,
): Promise<void> {
  if (!Number.isInteger(line) || line < 1) return;
  const { liveEditor } = await import("../../editor-host/live-editor.ts");
  const pmDoc = liveEditor(docId)?.view?.state?.doc;
  if (pmDoc === undefined || pmDoc === null) return;
  let count = 0;
  let targetId: string | null = null;
  pmDoc.descendants((node) => {
    if (targetId !== null) return false;
    if (node.type.name !== "block") return true;
    if (node.attrs["type"] === "ink_line") {
      count++;
      if (count === line) {
        const id: unknown = node.attrs["id"];
        if (typeof id === "string") targetId = id;
        return false;
      }
    }
    return false;
  });
  if (targetId !== null) {
    void editor.run({ kind: "go_to", blockId: targetId, offset: 0 });
  }
}

/**
 * Finds the enclosing Ink knot name for the open editor's current caret position (works when the caret
 * is inside a stitch under that knot); returns null when the caret is above the first knot or no editor is open.
 */
export async function caretKnotOf(docId: string): Promise<string | null> {
  const { liveEditor } = await import("../../editor-host/live-editor.ts");
  const view = liveEditor(docId)?.view;
  if (view === undefined || view === null) return null;
  const { state } = view;
  const resolved = state.selection.$from;
  let caretBlockId: string | null = null;
  for (let depth = resolved.depth; depth > 0; depth--) {
    const node = resolved.node(depth);
    if (node.type.name === "block") {
      const id: unknown = node.attrs["id"];
      if (typeof id === "string") caretBlockId = id;
      break;
    }
  }
  if (caretBlockId === null) return null;
  let currentKnot: string | null = null;
  let found = false;
  state.doc.descendants((node) => {
    if (found) return false;
    if (node.type.name !== "block") return true;
    if (node.attrs["type"] === "ink_line") {
      const match = KNOT_HEADER.exec(node.textContent.trim());
      if (match !== null) currentKnot = match[1] ?? null;
      if (node.attrs["id"] === caretBlockId) {
        found = true;
        return false;
      }
    }
    return false;
  });
  return found ? currentKnot : null;
}
