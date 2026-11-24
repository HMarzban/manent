// The comment popover's own React root, at the end of the document's body outside the shell tree.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { CommentPopover } from "./comment-popover.tsx";
import type { CommentPopoverProps } from "./comment-popover.tsx";

export interface CommentPopoverRoot {
  render(key: string, props: CommentPopoverProps | null): void;
  destroy(): void;
}

export function createCommentPopoverRoot(): CommentPopoverRoot {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return {
    render(key, props) {
      root.render(
        props === null
          ? null
          : createElement(CommentPopover, { key, ...props }),
      );
    },
    destroy() {
      queueMicrotask(() => {
        root.unmount();
        container.remove();
      });
    },
  };
}
