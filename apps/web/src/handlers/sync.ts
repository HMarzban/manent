// The handlers of the sync and To review commands.
import type { CommandHandlers } from "@manent/commands";
import { focusReviewEntry } from "../screens/document/to-review.tsx";
import { panelsActions } from "../state/panels.store.ts";
import type { HandlerDeps } from "./index.ts";

export function syncHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "history.review" | "review.undo"> {
  const { services, shellState, frame } = deps;
  return {
    "history.review"() {
      const { docId } = shellState();
      if (docId === null) return;
      // read now: the target holds only until the end of the task that set it
      const blockId = services.review.focusTarget(docId).get();
      panelsActions.open("side", "history");
      frame(() => focusReviewEntry(deps.dom, blockId));
    },
    "review.undo"() {
      services.review.reopenKept();
    },
  };
}
