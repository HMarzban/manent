import { Plugin } from "prosemirror-state";
import type { EditorPluginHost } from "../script-editor/create.ts";

export function annotationsPlugin(_host: EditorPluginHost): Plugin {
  return new Plugin({});
}
