// Timing command handlers; what acts on the open page loads apart from the entry.
import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";

export function timingHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "timing.exclude" | "timing.include"> {
  const setExcluded = (excluded: boolean) => (): void => {
    const { docId } = deps.shellState();
    if (docId === null) return;
    void import("../editor-host/timing.ts").then(({ setTimingExcluded }) =>
      setTimingExcluded(docId, excluded),
    );
  };
  return {
    "timing.exclude": setExcluded(true),
    "timing.include": setExcluded(false),
  };
}
