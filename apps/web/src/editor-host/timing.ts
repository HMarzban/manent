import { timingPlugin } from "@manent/editor";
import type { Plugin } from "@manent/editor";
import type { EditorPluginContext } from "./plugins.ts";

export function timingEditorPlugin(_context: EditorPluginContext): Plugin {
  return timingPlugin({
    sink: { publish: () => {} },
    words: { unreadTime: "" },
  });
}

export function setTimingExcluded(_docId: string, _excluded: boolean): void {}
