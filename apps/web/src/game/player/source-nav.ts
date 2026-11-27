// Dynamic-import bridge between the Game Script player and the open editor (keeps @manent/editor out of static chunks).
import { sceneIdForBlock } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { EditorControl } from "../../editor-host/control.ts";

const LIVE_DEBOUNCE_MS = 120;

function extractDocBlocks(json: DocJSON): readonly BlockJSON[] {
  return json.content?.flatMap((section) => section.content ?? []) ?? [];
}

/** Reads the open editor's current blocks for `docId`, or null when no live editor is mounted. */
export async function readLiveGameBlocks(
  docId: string,
): Promise<readonly BlockJSON[] | null> {
  const { liveEditor } = await import("../../editor-host/live-editor.ts");
  const editor = liveEditor(docId);
  if (editor === null) return null;
  return extractDocBlocks(editor.view.state.doc.toJSON() as DocJSON);
}

/**
 * Subscribes to live document updates for `docId` off the keystroke path (debounced) and calls
 * `onBlocks` whenever the live editor attaches or its CRDT document changes.
 */
export function subscribeLiveGameBlocks(
  docId: string,
  onBlocks: (blocks: readonly BlockJSON[]) => void,
): () => void {
  let disposed = false;
  let stopLive: (() => void) | null = null;
  let stopDoc: (() => void) | null = null;
  let attachedDoc: object | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (): void => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  void import("../../editor-host/live-editor.ts").then(
    ({ liveEditor, subscribeLiveEditors }) => {
      if (disposed) return;

      const emitNow = (): void => {
        if (disposed) return;
        const editor = liveEditor(docId);
        if (editor === null) return;
        onBlocks(extractDocBlocks(editor.view.state.doc.toJSON() as DocJSON));
      };

      const scheduleEmit = (): void => {
        if (disposed) return;
        clearTimer();
        timer = setTimeout(() => {
          timer = null;
          emitNow();
        }, LIVE_DEBOUNCE_MS);
      };

      const attach = (): void => {
        if (disposed) return;
        const editor = liveEditor(docId);
        if (editor === null) {
          stopDoc?.();
          stopDoc = null;
          attachedDoc = null;
          return;
        }
        if (attachedDoc === editor.doc) return;
        stopDoc?.();
        attachedDoc = editor.doc;
        stopDoc = editor.doc.subscribe(scheduleEmit);
        emitNow();
      };

      stopLive = subscribeLiveEditors(attach);
      attach();
    },
  );

  return () => {
    disposed = true;
    clearTimer();
    stopDoc?.();
    stopDoc = null;
    attachedDoc = null;
    stopLive?.();
    stopLive = null;
  };
}

/** Finds the enclosing scene ID for the open Game Script editor's current caret position, or null when unavailable. */
export async function caretSceneIdOf(docId: string): Promise<string | null> {
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
  const blocks = extractDocBlocks(state.doc.toJSON() as DocJSON);
  return sceneIdForBlock(blocks, caretBlockId);
}

/** Moves the open script editor's caret directly to `blockId`. */
export function jumpToGameBlock(blockId: string, editor: EditorControl): void {
  if (blockId === "") return;
  void editor.run({ kind: "go_to", blockId, offset: 0 });
}
