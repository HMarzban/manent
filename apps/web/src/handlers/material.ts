// The handlers of a speech's alternates; what opens them is the open page's, whose code loads apart from the entry.
import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";

export function materialHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "alternate.show" | "alternate.add"> {
  const show = (focus: "list" | "field"): void => {
    const { docId } = deps.shellState();
    if (docId === null) return;
    void import("../editor-host/material.ts").then(({ showAlternatesIn }) =>
      showAlternatesIn(docId, focus),
    );
  };
  return {
    "alternate.show": () => show("list"),
    "alternate.add": () => show("field"),
  };
}
