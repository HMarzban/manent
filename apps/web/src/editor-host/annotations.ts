import { annotationsPlugin as editorAnnotationsPlugin } from "@manent/editor";
import type { Plugin } from "@manent/editor";
import type { EditorPluginContext } from "./plugins.ts";

const noop = (): void => {};

export function annotationsPlugin(_context: EditorPluginContext): Plugin {
  return editorAnnotationsPlugin({
    annotations: () => [],
    subscribe: () => noop,
    label: () => "",
    onActivate: noop,
    onRemoved: noop,
    noteTrigger: { enabled: () => false, onTyped: noop },
  });
}
