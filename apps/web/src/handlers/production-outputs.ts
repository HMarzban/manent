// Handlers for production output commands: opens Export → Sides pre-filled with the caret's scene range.
import type { CommandHandlers } from "@manent/commands";
import type { EditorView } from "@manent/editor";
import { blocksOf } from "@manent/schema";
import { liveEditor } from "../editor-host/live-editor.ts";
import { setSidesRange, sidesExportHref } from "../send/sides-file.tsx";
import type { HandlerDeps } from "./index.ts";

const HEADING_TYPES: ReadonlySet<string> = new Set(["scene_heading", "slug"]);

type EditorState = EditorView["state"];

function blockIdAt(state: EditorState, pos: number): string | null {
  const resolved = state.doc.resolve(pos);
  for (let depth = resolved.depth; depth > 0; depth--) {
    const node = resolved.node(depth);
    if (node.type.name === "block") {
      const id: unknown = node.attrs.id;
      return typeof id === "string" ? id : null;
    }
  }
  return null;
}

function selectedHeadingRange(
  docId: string,
): { firstId: string; lastId: string } | null {
  const view = liveEditor(docId)?.view;
  if (view === undefined) return null;
  const { state } = view;
  const fromId = blockIdAt(state, state.selection.from);
  const toId = blockIdAt(state, state.selection.to);
  if (fromId === null) return null;
  let currentHeadingId: string | null = null;
  let firstId: string | null = null;
  let lastId: string | null = null;
  for (const block of blocksOf(state.doc)) {
    const { id, type } = block.attrs;
    if (id !== null && HEADING_TYPES.has(type)) currentHeadingId = id;
    if (id === fromId) firstId = currentHeadingId;
    if (id === toId) lastId = currentHeadingId;
  }
  if (firstId === null) return null;
  return { firstId, lastId: lastId ?? firstId };
}

export function productionOutputsHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "production.includeInSides"> {
  return {
    "production.includeInSides": () => {
      const { docId } = deps.shellState();
      if (docId === null) return;
      const range = selectedHeadingRange(docId);
      if (range !== null) setSidesRange(docId, range.firstId, range.lastId);
      deps.router.navigate(sidesExportHref(docId));
    },
  };
}
