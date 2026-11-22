// What Export writes a script from: the open editor's blocks, the script's notes and import record, and its production.
import {
  IMPORT_MAP,
  IMPORT_RECORD_KEY,
  NOTES_MAP,
  jsonMap,
} from "@manent/crdt";
import { isNumberedHeading, keptOf, revisionKey } from "@manent/editor";
import type { EditorView } from "@manent/editor";
import type { ExportProduction, ScriptForExport } from "@manent/formats";
import { deriveNumbers } from "@manent/revisions";
import { FORMATS, isScriptNote } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { liveEditor, livePagination } from "./live-editor.ts";

type EditorState = EditorView["state"];

/** Every block in document order, marks with their attributes: a colour keeps its name. */
function blocksIn(state: EditorState): BlockJSON[] {
  const doc: DocJSON = state.doc.toJSON();
  return (doc.content ?? []).flatMap((section) => section.content ?? []);
}

/** Null out of production; each heading's number is its issued one, else derived from its neighbours. */
function productionIn(
  state: EditorState,
  blocks: readonly BlockJSON[],
): ExportProduction | null {
  const view = keptOf(state)?.view ?? null;
  const marks = revisionKey.getState(state)?.marks;
  if (view === null || marks === undefined) return null;
  const headings = blocks.flatMap(({ attrs }) =>
    isNumberedHeading(attrs?.type) && typeof attrs?.id === "string"
      ? [{ blockId: attrs.id, num: view.issuedNumbers.get(attrs.id) ?? null }]
      : [],
  );
  return {
    anchors: view.records,
    numbers: new Map([
      ...view.issuedNumbers,
      ...deriveNumbers(headings, view.numbering, view.used),
    ]),
    numbering: view.numbering,
    sources: [...view.earlier, { ...view.active, marks }],
  };
}

/** The script `docId`'s open editor holds, titled `title`; null while no editor with pages is open for it. */
export async function scriptForExport(
  docId: string,
  title: string,
): Promise<ScriptForExport | null> {
  const editor = liveEditor(docId);
  const shown = livePagination(docId)?.profile.format;
  const format = FORMATS.find((id) => id === shown);
  if (editor === null || format === undefined) return null;
  const { parseImportRecord } = await import("@manent/formats");
  const { state } = editor.view;
  const blocks = blocksIn(state);
  const notes = Object.entries(
    jsonMap(editor.doc, NOTES_MAP).entries(),
  ).flatMap(([id, note]) => (isScriptNote(note) ? [{ id, note }] : []));
  return {
    title,
    format,
    blocks,
    notes,
    record: parseImportRecord(
      jsonMap(editor.doc, IMPORT_MAP).get(IMPORT_RECORD_KEY),
    ),
    production: productionIn(state, blocks),
  };
}
