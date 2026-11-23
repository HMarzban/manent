// Moving the caret to a place in the script: a block a place names, the next or previous scene, and where a person
// present is; loaded apart from the editor, the first time one is asked for.
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { headingAt, outlineOf } from "../bridge/outline.ts";
import { cursorsKey } from "../cursors/cursor-plugin.ts";
import { blockAt } from "../pagination/block-index.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type { ActionResult } from "./action-types.ts";
import type { EditorAction } from "./registry.ts";

/** The actions this module runs. */
export type GoToAction = Extract<
  EditorAction,
  { kind: "go_to" | "step_scene" | "go_to_person" }
>;

/** The heading after the caret's scene (1) or before it (-1), as the outline lists scenes; null past either end or without pages. */
function sceneFrom(state: EditorState, direction: 1 | -1): string | null {
  const pages = paginationKey.getState(state);
  if (pages === undefined) return null;
  const caret = blockAt(pages.index, state.selection.head);
  const outline = outlineOf(pages.pagination, caret);
  const current = headingAt(outline, caret);
  const scenes = outline.entries.filter((entry) => entry.kind === "scene");
  const at = current === null ? -1 : scenes.indexOf(outline.entries[current]!);
  if (at === -1 && direction === -1) return null;
  return scenes[at + direction]?.blockId ?? null;
}

/** Where the cursor of the person present `userId` is; null while they have none. */
function cursorOf(
  state: EditorState,
  userId: string,
): { blockId: string; offset: number } | null {
  const cursor = cursorsKey
    .getState(state)
    ?.cursors.find((c) => c.userId === userId);
  return cursor?.place.head ?? null;
}

/** Whether an element carries `blockId`, from the pages' blocks when there are pages. */
function hasBlock(state: EditorState, blockId: string): boolean {
  const pages = paginationKey.getState(state);
  if (pages !== undefined)
    return pages.pagination.blocks.some((block) => block.id === blockId);
  let found = false;
  state.doc.descendants((node) => {
    if (found) return false;
    if (node.isTextblock) {
      found = node.attrs.id === blockId;
      return false;
    }
    return true;
  });
  return found;
}

/** `go` puts the caret in the block, at `offset`, near the view's top, and focuses the page. */
function goToBlock(
  state: EditorState,
  target: { blockId: string; offset: number } | null,
  go: (blockId: string, offset: number) => void,
): ActionResult {
  if (target === null || !hasBlock(state, target.blockId))
    return { ok: false, reason: "nothing_to_do" };
  go(target.blockId, target.offset);
  return { ok: true };
}

/** Runs a move of the caret on the view as it is now; `go` puts the caret in a block and focuses the page. */
export function runGoTo(
  view: EditorView,
  action: GoToAction,
  go: (blockId: string, offset: number) => void,
): ActionResult {
  const { state } = view;
  switch (action.kind) {
    case "go_to":
      return goToBlock(state, action, go);
    case "step_scene": {
      const blockId = sceneFrom(state, action.direction);
      return goToBlock(
        state,
        blockId === null ? null : { blockId, offset: 0 },
        go,
      );
    }
    case "go_to_person":
      return goToBlock(state, cursorOf(state, action.userId), go);
  }
}
