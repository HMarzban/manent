// A scene's row menu item for starting a comment anchored to that scene heading.
import { COMMENTS_WORDS, DropdownMenuItem } from "@manent/ui";
import type { ReactNode } from "react";
import { commentsActions, useComments } from "../state/comments.store.ts";

export function CommentSceneItem(props: {
  docId: string;
  headingId: string;
}): ReactNode {
  const { docId, headingId } = props;
  const { canComment } = useComments(docId);
  if (!canComment) return null;
  return (
    <DropdownMenuItem
      onClick={() =>
        commentsActions.openPopover(docId, { kind: "scene_comment", headingId })
      }
    >
      {COMMENTS_WORDS.commentOnSceneCommand}
    </DropdownMenuItem>
  );
}
