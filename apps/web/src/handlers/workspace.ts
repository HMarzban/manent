// Handlers for Workspace settings commands.
import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";

const WORKSPACE_PATH = /^\/w\/([^/?#]+)/;

function workspaceIdFromHere(deps: HandlerDeps): string | null {
  const place = deps.router.here();
  const query = place.search.w;
  if (typeof query === "string" && query.trim() !== "") return query.trim();
  const matched = WORKSPACE_PATH.exec(place.href)?.[1];
  if (matched !== undefined && matched.length > 0) {
    try {
      return decodeURIComponent(matched);
    } catch {
      return matched;
    }
  }
  return null;
}

export function workspaceHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "workspace.settings"> {
  return {
    "workspace.settings"() {
      const fromUrl = workspaceIdFromHere(deps);
      if (fromUrl !== null) {
        deps.router.navigate(
          `/w/${encodeURIComponent(fromUrl)}/settings/people`,
        );
        return;
      }
      void deps.api.me().then(
        (answer) => {
          if (!answer.ok) return;
          const first = answer.me.workspaces[0];
          if (first !== undefined) {
            deps.router.navigate(
              `/w/${encodeURIComponent(first.id)}/settings/people`,
            );
          }
        },
        () => {
          // unreachable server: stay where the person is
        },
      );
    },
  };
}
