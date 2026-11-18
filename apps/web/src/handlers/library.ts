// The Library's commands: a new script, and the New project popover.
import type { CommandHandlers } from "@manent/commands";
import { dialogActions } from "../state/dialog.store.ts";
import type { HandlerDeps } from "./index.ts";

/** The workspace the Library shows: the one in its search, else the person's first, else the person's own desk. */
async function shownWorkspace(deps: HandlerDeps): Promise<string> {
  const { w } = deps.router.here().search;
  if (typeof w === "string") return w;
  const me = await deps.api.me();
  return (me.ok ? me.me.workspaces[0]?.id : undefined) ?? deps.services.userId;
}

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
