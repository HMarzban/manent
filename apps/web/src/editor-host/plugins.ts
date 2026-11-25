// The live editor's feature plugins, one line per feature; each plugin follows the bridge.
import { changeMarksPlugin, changesPlugin } from "@manent/editor";
import type {
  EditorPluginHost,
  FactsSink,
  Plugin,
  PresencePort,
} from "@manent/editor";
import type { PersonServices } from "../services/ports.ts";
import { productionEditorPlugin } from "./production.ts";
import { reviewBarPlugin } from "./review-bar.ts";
import { annotationsPlugin } from "./annotations.ts";
import { suggestPlugin } from "./suggest.ts";
import { materialPlugin } from "./material.ts";
import { marginPeoplePlugin } from "./margin-people.ts";
import { projectNamesPlugin } from "./project-names.ts";
import { roomLogPlugin } from "./room-log.ts";
import { timingEditorPlugin } from "./timing.ts";
import { inkMarksEditorPlugin } from "./ink-marks.ts";

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
  () => changeMarksPlugin(),
  productionEditorPlugin,
  (context) => annotationsPlugin(context),
  (context) => suggestPlugin(context),
  (context) => materialPlugin(context),
  (context) => marginPeoplePlugin(context),
  (context) => projectNamesPlugin(context),
  (context) => roomLogPlugin(context),
  timingEditorPlugin,
  inkMarksEditorPlugin,
];
