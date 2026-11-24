// The alternates popover's own React root, at the end of the document's body: the page's editor draws it, outside the
// shell's tree.
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { AlternatesPopover } from "./alternates-popover.tsx";
import type { AlternatesPopoverProps } from "./alternates-popover.tsx";

export interface AlternatesRoot {
  /** Draws the popover of the speech `blockId`, or nothing; the popover of another speech opens afresh. */
  render(
    shown: { blockId: string; props: AlternatesPopoverProps } | null,
  ): void;
  destroy(): void;
}

export function createAlternatesRoot(): AlternatesRoot {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return {
    render(shown) {
      root.render(
        shown === null
          ? null
          : createElement(AlternatesPopover, {
              key: shown.blockId,
              ...shown.props,
            }),
      );
    },
    destroy() {
      // the editor goes while the shell renders, which may not unmount another root at once
      queueMicrotask(() => {
        root.unmount();
        container.remove();
      });
    },
  };
}
