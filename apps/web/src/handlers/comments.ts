// Command handlers for opening the comment or note composer on a selection, scene or script.
import type { CommandHandlers } from "@manent/commands";
import { commentsActions } from "../state/comments.store.ts";
import type { HandlerDeps } from "./index.ts";

export type CommentCommandId =
  "comment.add" | "comment.onScene" | "comment.onScript" | "note.add";

export function commentsHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, CommentCommandId> {
  const open = (
    trigger: Parameters<typeof commentsActions.openPopover>[1],
  ): void => {
    const { docId } = deps.shellState();
    if (docId !== null) commentsActions.openPopover(docId, trigger);
  };
  return {
    "comment.add": () => open({ kind: "selection_comment" }),
    "comment.onScene": () => open({ kind: "scene_comment", headingId: null }),
    "comment.onScript": () => open({ kind: "script_comment" }),
    "note.add": () => open({ kind: "note_at_caret" }),
  };
}
