// The handlers of writers' material; what acts on the open page loads apart from the entry.
import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";

export function materialHandlers(
  deps: HandlerDeps,
): Pick<
  CommandHandlers,
  "alternate.show" | "alternate.add" | "material.moveToCuts"
> {
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
    "material.moveToCuts"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      void import("../editor-host/material.ts").then(
        ({ moveSelectionToCutsIn }) => moveSelectionToCutsIn(docId),
      );
    },
  };
}
