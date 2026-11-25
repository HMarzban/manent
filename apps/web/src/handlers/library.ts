// A new script, and the New project popover, from any screen (routing to Private when ?view=private is shown).
import type { CommandHandlers } from "@manent/commands";
import {
  createPrivateProject,
  privateProjectPicker,
} from "../services/sync/private-folder.ts";
import { dialogActions } from "../state/dialog.store.ts";
import type { HandlerDeps } from "./index.ts";
import { shownWorkspace } from "./shown-workspace.ts";

// the Library's route id, which is also its path
const LIBRARY_ROUTE = "/";

const inPrivateView = (deps: HandlerDeps): boolean => {
  const here = deps.router.here();
  return here.routeId === LIBRARY_ROUTE && here.search.view === "private";
};

export function libraryHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "library.newScript" | "library.newProject"> {
  const { services, router, dom } = deps;
  return {
    "library.newScript"() {
      void (async () => {
        if (inPrivateView(deps)) {
          const { docId } = await createPrivateProject({
            client: services.favourites.client,
            userId: services.userId,
            kind: "film",
            language: deps.language,
            now: deps.now,
            newId: () => crypto.randomUUID(),
          });
          router.navigate(`/s/${docId}`);
          return;
        }
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
      if (inPrivateView(deps)) {
        privateProjectPicker.open();
        return;
      }
      // the kinds are chosen in the Library's popover, so from another screen the Library opens first
      if (router.here().routeId !== LIBRARY_ROUTE)
        router.navigate(LIBRARY_ROUTE);
      dialogActions.open("new_project");
    },
  };
}
