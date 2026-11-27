import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";

export function seriesHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "series.openBoard"> {
  return {
    "series.openBoard"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      const projectId = deps.services.library.documentProject(docId).get();
      if (projectId === null) return;
      deps.router.navigate(
        `/p/${projectId}/board?ep=${encodeURIComponent(docId)}`,
      );
    },
  };
}
