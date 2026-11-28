// What lets the rest of the app reach a built editor: the control, and the registry of live editors.
import type { CrdtDoc } from "@manent/crdt";
import type { PresencePort, ScriptEditor } from "@manent/editor";
import { actionOf } from "./command-actions.ts";
import type { EditorControl } from "./control.ts";
import { registerLiveEditor } from "./live-editor.ts";
import { remoteCursorsOf } from "./margin-people.ts";

/** Attaches `editor` to the control and registers it as its document's live editor; returns the stop of both. */
export function connectEditor(options: {
  control: EditorControl;
  docId: string;
  doc: CrdtDoc;
  editor: ScriptEditor;
  presence: PresencePort;
  editable: boolean;
}): () => void {
  const { editor } = options;
  const detach = options.control.attach({
    run: (request) => editor.run(actionOf(request)),
    zoomPercent: () => editor.zoomPercent(),
    showTitlePage: () => editor.showTitlePage(),
  });
  const unregister = registerLiveEditor({
    docId: options.docId,
    doc: options.doc,
    view: editor.view,
    scaffold: editor.scaffold,
    presence: options.presence,
    editable: options.editable,
    setEditable: (next) => editor.setEditable(next),
    pagination: () => editor.pagination(),
    zoom: () => (editor.zoomPercent() ?? 100) / 100,
    frontPages: () => editor.frontPages(),
    furniture: () => editor.furniture(),
    remoteCursors: () => remoteCursorsOf(editor.view),
  });
  return () => {
    detach();
    unregister();
  };
}
