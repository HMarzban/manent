// The History tab's sections, one line per section, in display order: To review, then the version list.
import type { ComponentType } from "react";
import { HistoryList } from "./history-list.tsx";
import { ToReview, useToReviewVisible } from "./to-review.tsx";

export interface HistorySection {
  readonly id: "to_review" | "versions";
  readonly Section: ComponentType<{ docId: string }>;
  /** A hook. */
  useVisible(docId: string): boolean;
}

export const HISTORY_SECTIONS: readonly HistorySection[] = [
  { id: "to_review", Section: ToReview, useVisible: useToReviewVisible },
  { id: "versions", Section: HistoryList, useVisible: () => true },
];
