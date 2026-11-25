// Pure ProseMirror position and popover coordinate helpers for comment/note annotations.
import type { EditorView } from "@manent/editor";
import { textAnchorAt } from "@manent/schema";
import type { TextAnchor } from "@manent/schema";
import { sceneHeadingBefore } from "../comments/annotations-map.ts";
import type {
  PopoverMode,
  SceneBlockInfo,
  ScriptCommentsState,
} from "../comments/comments-types.ts";

export type PmDoc = EditorView["state"]["doc"];
export type PmNode = NonNullable<PmDoc["firstChild"]>;
export type Coords = { left: number; top: number };

export const ANNOTATION_GAP_PX = 6;

export function findBlock(
  doc: PmDoc,
  blockId: string,
): { node: PmNode; contentPos: number } | null {
  let found: { node: PmNode; contentPos: number } | null = null;
  doc.descendants((node: PmNode, pos: number) => {
    if (found !== null) return false;
    if (node.type.name !== "block") return true;
    if (node.attrs.id === blockId) found = { node, contentPos: pos + 1 };
    return false;
  });
  return found;
}

export function anchorAt(
  doc: PmDoc,
  from: number,
  to: number,
): TextAnchor | null {
  const $from = doc.resolve(from);
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name !== "block") continue;
    const id = typeof node.attrs.id === "string" ? node.attrs.id : "";
    if (id === "") return null;
    const text = node.textContent;
    const start = Math.max(0, Math.min(text.length, from - $from.start(depth)));
    const end = Math.max(start, Math.min(text.length, to - $from.start(depth)));
    return textAnchorAt({ id, text }, start, end);
  }
  return null;
}

export function fallbackPlace(view: EditorView): Coords {
  const rect = view.dom.getBoundingClientRect();
  return {
    left: Math.max(16, rect.left + rect.width / 2 - 140),
    top: Math.max(16, rect.top + 24),
  };
}

export function coordsPlace(view: EditorView, pos: number): Coords {
  try {
    const coords = view.coordsAtPos(pos);
    return { left: coords.left, top: coords.bottom + ANNOTATION_GAP_PX };
  } catch {
    return fallbackPlace(view);
  }
}

export function anchorPlace(
  view: EditorView,
  anchor: TextAnchor | null,
): Coords {
  if (anchor === null) return fallbackPlace(view);
  const block = findBlock(view.state.doc, anchor.blockId);
  if (block === null) return fallbackPlace(view);
  return coordsPlace(
    view,
    block.contentPos + Math.min(anchor.start, block.node.textContent.length),
  );
}

export function livePlace(
  view: EditorView,
  mode: PopoverMode,
  state: ScriptCommentsState,
): Coords {
  if (mode.kind === "comment" || mode.kind === "note")
    return anchorPlace(view, mode.anchor);
  const anchor =
    state.threads[mode.id]?.anchor ??
    (state.canEdit
      ? state.notes.find((n) => n.id === mode.id)?.note.anchor
      : null) ??
    null;
  if (anchor === null) return fallbackPlace(view);
  return state.removedIds.has(mode.id) ? mode.place : anchorPlace(view, anchor);
}

export function currentSceneId(
  doc: PmDoc,
  pos: number,
  blockScenes: ReadonlyMap<string, SceneBlockInfo>,
): string | null {
  const anchor = anchorAt(doc, pos, pos);
  if (anchor === null) return null;
  const cached = blockScenes.get(anchor.blockId);
  if (cached !== undefined)
    return cached.sceneBlockId === "" ? null : cached.sceneBlockId;
  return sceneHeadingBefore(doc, pos);
}
