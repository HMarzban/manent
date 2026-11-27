import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";
import { askReadRate, askTargetPages } from "./numeric-settings.ts";

export function projectHandlers(
  deps: HandlerDeps,
): Pick<
  CommandHandlers,
  "project.openSettings" | "project.readRate" | "project.targetPages"
> {
  return {
    "project.openSettings"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      const projectId = deps.services.library.documentProject(docId).get();
      if (projectId === null) return;
      const from = deps.router.here().href;
      deps.router.navigate(
        `/p/${projectId}/settings?from=${encodeURIComponent(from)}`,
      );
    },
    "project.readRate": () => askReadRate(deps),
    "project.targetPages": () => askTargetPages(deps),
  };
}
