// The To review section of the History tab: each passage two wordings compete for, and Recovered text, with their choices.
import { useSubscribable } from "@manent/ui";
import { Suspense, lazy } from "react";
import type { ComponentType, ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import type { ShellDom } from "../../shell/regions.tsx";
import { SUGGESTIONS_REVIEW_SOURCE } from "../../writing/suggestions/review-source.ts";
import { PanelListSkeleton } from "./panel-surface.tsx";

// the rows read the script, which loads apart from the entry
const ToReviewList = lazy(async () => ({
  default: (await import("./to-review-list.tsx")).ToReviewList,
}));

// the block whose entry takes focus once To review is drawn; null: none asked
let pending: string | null = null;

/** Focuses the asked entry's first choice when it is drawn; false when it is not. */
function focusPending(): boolean {
  const row =
    pending === null
      ? null
      : document.querySelector(
          `[data-review-block="${CSS.escape(pending)}"] button`,
        );
  if (!(row instanceof HTMLElement)) return false;
  pending = null;
  row.focus();
  return true;
}

/** Focus goes to the entry of `blockId` in To review, once drawn, or to its first entry when `blockId` is null. */
export function focusReviewEntry(dom: ShellDom, blockId: string | null): void {
  pending = blockId;
  if (!focusPending()) dom.focusSidePanel();
}

/** What To review lists from one source: its entries, drawn in list order, and how many are open. */
export interface ReviewSource {
  readonly id: string;
  readonly List: ComponentType<{
    docId: string;
    /** Focuses the entry history.review asked for, once drawn; false when it is not drawn. */
    focusPending: () => boolean;
  }>;
  /** A hook. */
  useCount(docId: string): number;
}

function useOpenCount(docId: string): number {
  const { review } = useServices();
  return useSubscribable(review.openCount(docId));
}

export const REVIEW_SOURCES: readonly ReviewSource[] = [
  { id: "passages", List: ToReviewList, useCount: useOpenCount },
  SUGGESTIONS_REVIEW_SOURCE,
];

export function ToReview(props: { docId: string }): ReactNode {
  return (
    <Suspense fallback={<PanelListSkeleton />}>
      {REVIEW_SOURCES.map(({ id, List }) => (
        <List key={id} docId={props.docId} focusPending={focusPending} />
      ))}
    </Suspense>
  );
}

/** A hook: whether the script has anything to review. */
export function useToReviewVisible(docId: string): boolean {
  let count = 0;
  for (const source of REVIEW_SOURCES) count += source.useCount(docId);
  return count > 0;
}
