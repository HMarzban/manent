// The Library's commands: a new script, and the New project popover.
import type { CommandHandlers } from "@manent/commands";
import { dialogActions } from "../state/dialog.store.ts";
import type { HandlerDeps } from "./index.ts";
import { shownWorkspace } from "./shown-workspace.ts";

export function libraryHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "library.newScript" | "library.newProject"> {
  const { services, router, dom } = deps;
  return {
    "library.newScript"() {
      void (async () => {
        const workspace = await shownWorkspace(deps);
        const { docId } = await services.library.createProject(
          workspace,
          "film",
        );
        router.navigate(`/s/${docId}`);
      })();
    },
    "library.newProject"() {
      dom.rememberFocus();
      dialogActions.open("new_project");
    },
  };
}
