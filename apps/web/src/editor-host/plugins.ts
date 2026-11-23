// The live editor's feature plugins, one line per feature; each plugin follows the bridge.
import { changesPlugin } from "@manent/editor";
import type {
  EditorPluginHost,
  FactsSink,
  Plugin,
  PresencePort,
} from "@manent/editor";
import type { PersonServices } from "../services/ports.ts";
import { productionEditorPlugin } from "./production.ts";
import { reviewBarPlugin } from "./review-bar.ts";

export interface EditorPluginContext extends EditorPluginHost {
  readonly docId: string;
  readonly services: PersonServices;
  readonly facts: FactsSink;
  /** Sends this person's cursor to the others, and tells the others' cursors and names. */
  readonly presence: PresencePort;
}

export const EDITOR_PLUGINS: readonly ((
  context: EditorPluginContext,
) => Plugin)[] = [
  reviewBarPlugin,
  () => changesPlugin(),
  productionEditorPlugin,
];
