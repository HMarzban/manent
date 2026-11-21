import { commandKeymap } from "@manent/editor";
import type { Plugin } from "@manent/editor";
import type { EditorPluginContext } from "./plugins.ts";

export const productionEditorPlugin: (
  context: EditorPluginContext,
) => Plugin = () => commandKeymap({ resolve: () => null, run: () => false });
