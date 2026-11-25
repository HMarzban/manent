// Export… on a project's row: Send titled Export on the project's first document, As set to the project's archive,
// returning to the Library it was opened from.
import type { CommandHandlers } from "@manent/commands";
import { archiveSource } from "../archive/archive-source.ts";
import { exportTarget } from "../archive/export-target.ts";
import { sendPath } from "../screens/send/form-ids.ts";
import { archiveFileType } from "../send/file-types/archive.ts";
import type { HandlerDeps } from "./index.ts";

export function archiveHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "library.exportProject"> {
  const { router } = deps;
  archiveSource.set(deps.services);
  return {
    // the row chooses its project before the command runs
    "library.exportProject"() {
      const docId = exportTarget.take();
      if (docId === null) return;
      const search = new URLSearchParams({
        as: archiveFileType.id,
        from: router.here().href,
      });
      router.navigate(`${sendPath(docId, "export")}?${search.toString()}`);
    },
  };
}
