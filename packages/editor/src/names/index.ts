import { Plugin } from "prosemirror-state";
import type { EditorPluginHost } from "../script-editor/create.ts";

export function projectNamesPlugin(_host: EditorPluginHost): Plugin {
  return new Plugin({});
}
