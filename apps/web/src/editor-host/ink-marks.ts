// Editor plugin wiring Ink background compilation into problem and visited-line marks.
import { commandKeymap, inkMarksPlugin } from "@manent/editor";
import type { InkMarkSource, Plugin } from "@manent/editor";
import { inkSourceOf } from "@manent/formats";
import type { BlockJSON, DocJSON } from "@manent/schema";
import {
  closeInkCompileClient,
  inkCompileClient,
  inkVisitedLines,
  openInkCompileClient,
  subscribeInkVisited,
} from "../ink/compile-client.ts";
import { liveEditor, subscribeLiveEditors } from "./live-editor.ts";
import type { EditorPluginContext } from "./plugins.ts";

/** Reads Ink source once from the open editor's ProseMirror document (never on a keystroke). */
function readInkSource(docId: string): string {
  const editor = liveEditor(docId);
  if (editor === null) return "";
  const json = editor.view.state.doc.toJSON() as DocJSON;
  const blocks: BlockJSON[] =
    json.content?.flatMap((section) => section.content ?? []) ?? [];
  return inkSourceOf(blocks);
}

/**
 * Mounts Ink problem and visited-line marks and starts a background compile client when the open
 * document's format is `"ink"`; returns an inert plugin for every other format.
 */
export function inkMarksEditorPlugin(context: EditorPluginContext): Plugin {
  const { docId, services, layer } = context;
  let isInk = false;
  try {
    isInk = services.openScriptStore(docId).get("script.format") === "ink";
  } catch {
    isInk = false;
  }
  if (!isInk) {
    return commandKeymap({ resolve: () => null, run: () => false });
  }

  const source: InkMarkSource = {
    problems: () => inkCompileClient(docId)?.snapshot().problems ?? [],
    visited: () => inkVisitedLines(docId),
    subscribe(listener) {
      const client = openInkCompileClient(docId);
      const stopClient = client.subscribe(listener);
      const stopVisited = subscribeInkVisited(docId, listener);
      let stopDoc: (() => void) | null = null;
      let attachedDoc: object | null = null;

      const attachToLiveEditor = (): void => {
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
        stopDoc = editor.doc.subscribe(() => {
          client.scheduleCompile(() => readInkSource(docId));
        });
        void client.compileNow(readInkSource(docId));
      };

      const stopLive = subscribeLiveEditors(attachToLiveEditor);
      attachToLiveEditor();

      return () => {
        stopLive();
        stopDoc?.();
        stopDoc = null;
        attachedDoc = null;
        stopVisited();
        stopClient();
        closeInkCompileClient(docId);
      };
    },
  };

  return inkMarksPlugin(source, { layer });
}
