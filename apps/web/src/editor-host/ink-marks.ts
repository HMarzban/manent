import { commandKeymap } from "@manent/editor";
import type { Plugin } from "@manent/editor";
import type { EditorPluginContext } from "./plugins.ts";

export function inkMarksEditorPlugin(_context: EditorPluginContext): Plugin {
  return commandKeymap({ resolve: () => null, run: () => false });
}
