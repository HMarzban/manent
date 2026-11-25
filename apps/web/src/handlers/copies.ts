// Duplicate, from Title ▾, File and the palette (the script as it is now) and from a version's row (that version);
// opening the last copy beside the page; and Start a … from this….
import type { CommandHandlers } from "@manent/commands";
import type { StartFromTarget } from "@manent/ui";
import { openBeside } from "../beside/open-beside.ts";
import type { CopySource } from "../copies/copy-document.ts";
import { lastCopy } from "../copies/last-copy.ts";
import { copyRefusedMessage } from "../copies/messages.ts";
import {
  startFromRefusedMessage,
  startedFromBookMessage,
  startedFromScriptMessage,
} from "../copies/start-from/messages.ts";
import { historyView } from "../history/history-view.ts";
import type { HandlerDeps } from "./index.ts";

const NAV_WAIT_FRAMES = 30;

/** Copies `source`, loaded apart from the first load, and opens the copy; a copy the Library refused is said. */
function duplicateAndOpen(deps: HandlerDeps, source: CopySource): void {
  const { services } = deps;
  void import("../copies/duplicate.ts")
    .then(({ duplicate }) => duplicate(services, source))
    .then((made) => {
      if (made.ok) deps.router.navigate(`/s/${made.docId}`);
      else if (made.reason === "not_saved")
        services.messages.push(copyRefusedMessage(made.title));
    });
}

/**
 * Opens `sourceDocId` beside `targetDocId` after navigation mounts the new document screen, so the previous
 * screen's cleanup never closes it.
 */
function openSourceAfterNavigate(
  deps: HandlerDeps,
  targetDocId: string,
  sourceDocId: string,
  at: { blockId: string } | null,
): void {
  let remaining = NAV_WAIT_FRAMES;
  const wait = (): void => {
    if (deps.shellState().docId === targetDocId) {
      // one more frame lets the leaving screen's unmount cleanup finish before beside opens
      deps.frame(() => {
        if (deps.shellState().docId === targetDocId)
          openBeside(sourceDocId, "source", at);
      });
      return;
    }
    remaining -= 1;
    if (remaining > 0) deps.frame(wait);
  };
  deps.frame(wait);
}

/** Starts a new project of `target` from the open document, navigates to it and opens its source beside. */
function startFromAndOpen(deps: HandlerDeps, target: StartFromTarget): void {
  const { docId } = deps.shellState();
  if (docId === null) return;
  const { services } = deps;
  void import("../copies/start-from/start-from.ts")
    .then(({ startFrom }) =>
      startFrom(services, {
        docId,
        target,
        language: deps.language,
        now: deps.now,
      }),
    )
    .then((made) => {
      if (!made.ok) {
        services.messages.push(
          startFromRefusedMessage(target, made.sourceTitle),
        );
        return;
      }
      services.messages.push(
        made.fromBook
          ? startedFromBookMessage(target, made.sourceTitle, made.chapterCount)
          : startedFromScriptMessage(target, made.sourceTitle),
      );
      deps.router.navigate(`/s/${made.docId}`);
      openSourceAfterNavigate(
        deps,
        made.docId,
        made.sourceDocId,
        made.firstChapterId === null ? null : { blockId: made.firstChapterId },
      );
    });
}

export function copiesHandlers(
  deps: HandlerDeps,
): Pick<
  CommandHandlers,
  | "doc.duplicate"
  | "doc.duplicateVersion"
  | "copy.openCopyBeside"
  | "copy.startFilm"
  | "copy.startEpisode"
  | "copy.startStagePlay"
> {
  return {
    "doc.duplicate"() {
      const { docId } = deps.shellState();
      if (docId !== null) duplicateAndOpen(deps, { docId, versionId: null });
    },
    // the row selects its version before the command runs
    "doc.duplicateVersion"() {
      const view = historyView.get();
      if (view === null || view.selected === null) return;
      duplicateAndOpen(deps, {
        docId: view.docId,
        versionId: view.selected.item.id,
      });
    },
    "copy.openCopyBeside"() {
      const docId = lastCopy.get();
      if (docId !== null) openBeside(docId, "script", null);
    },
    "copy.startFilm"() {
      startFromAndOpen(deps, "film");
    },
    "copy.startEpisode"() {
      startFromAndOpen(deps, "episode");
    },
    "copy.startStagePlay"() {
      startFromAndOpen(deps, "stage_play");
    },
  };
}
