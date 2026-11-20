// The margin bar beside each passage of the open script that is to review.
import { marginMarksPlugin } from "@manent/editor";
import type { Plugin } from "@manent/editor";
import { REVIEW_WORDS } from "@manent/ui";

export function reviewBarPlugin(): Plugin {
  return marginMarksPlugin({
    blockIds: () => [],
    label: REVIEW_WORDS.marginBar,
    onActivate: () => {},
  });
}
