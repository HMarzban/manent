// The outline document's command handler: Start script from outline.
import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";

export function outlineHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "outline.startScript"> {
  return {
    "outline.startScript"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      void import("../outline-doc/start-script.ts").then((module) =>
        module.startScriptFromOutline(deps.services, docId),
      );
    },
  };
}
