// The live editor's feature plugins, one line per feature; each plugin follows the bridge.
import type { EditorPluginHost, FactsSink, Plugin } from "@manent/editor";
import type { PersonServices } from "../services/ports.ts";

export interface EditorPluginContext extends EditorPluginHost {
  readonly docId: string;
  readonly services: PersonServices;
  readonly facts: FactsSink;
}

export const EDITOR_PLUGINS: readonly ((
  context: EditorPluginContext,
) => Plugin)[] = [];
