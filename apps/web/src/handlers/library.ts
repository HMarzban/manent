// A new script, and the New project popover, from any screen.
import type { CommandHandlers } from "@manent/commands";
import { dialogActions } from "../state/dialog.store.ts";
import type { HandlerDeps } from "./index.ts";
import { shownWorkspace } from "./shown-workspace.ts";

// the Library's route id, which is also its path
const LIBRARY_ROUTE = "/";

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
      // the kinds are chosen in the Library's popover, so from another screen the Library opens first
      if (router.here().routeId !== LIBRARY_ROUTE)
        router.navigate(LIBRARY_ROUTE);
      dialogActions.open("new_project");
    },
  };
}
