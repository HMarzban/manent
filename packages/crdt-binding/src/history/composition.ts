// Remote updates held while an input method composes: applying one replaces the document and would end the composition.
import type { Timers } from "@manent/editor";
import { Plugin } from "prosemirror-state";
import type { BoundDocument } from "../binding/bind.ts";

/** How long after compositionend the hold is released when no view update comes first. */
export const COMPOSITION_RELEASE_MS = 50;

/**
 * Holds remote updates from compositionstart, however long the composition
 * lasts. After compositionend the release is owed: it happens at the view's
 * first update that is no longer composing, or COMPOSITION_RELEASE_MS later,
 * whichever is first, and when the view is destroyed. Holds and releases are
 * always balanced.
 */
export function compositionPlugin(
  document: BoundDocument,
  timers: Timers,
): Plugin {
  let holding = false;
  let cancelOwed: (() => void) | null = null;
  const release = () => {
    cancelOwed?.();
    cancelOwed = null;
    if (!holding) return;
    holding = false;
    document.releaseRemote();
  };
  return new Plugin({
    props: {
      handleDOMEvents: {
        compositionstart: () => {
          cancelOwed?.();
          cancelOwed = null;
          if (!holding) {
            holding = true;
            document.holdRemote();
          }
          return false;
        },
        compositionend: () => {
          if (holding && cancelOwed === null)
            cancelOwed = timers.schedule(release, COMPOSITION_RELEASE_MS);
          return false;
        },
      },
    },
    view: () => ({
      update: (view) => {
        if (cancelOwed !== null && !view.composing) release();
      },
      destroy: release,
    }),
  });
}
