import type { TourScenario } from "../../format.ts";
import { FERRY } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_COMMENTS: TourScenario = {
  id: "together-comments",
  group: "Work together",
  promise: "Reply to a comment and resolve it; everyone sees it close.",
  setup: setupOf(
    { userId: "leo", open: FERRY },
    [{ userId: "sam", open: FERRY }],
    "together-comments-ready",
  ),
  steps: [
    {
      text: 'On page 13, open the comment on "you say it twice".',
      highlight: "comment_popover",
    },
    {
      text: 'Reply "Happy. Keep it on 15." and choose Resolve.',
      highlight: "comment_popover",
    },
    {
      text: "In Sam's window, open the Comments tab.",
      highlight: "tab:comments",
    },
  ],
  check:
    'Leo reads "Resolved your comment."; Sam\'s tab showed "Happy. Keep it on 15." as it arrived, and the thread has left Open.',
  evidence: ["Resolved your comment.", "Happy. Keep it on 15."],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
