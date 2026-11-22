// The handlers of the version history commands; what each does loads apart from the entry the first time one runs.
import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";

export type HistoryCommandId =
  | "history.markVersion"
  | "history.nameDraft"
  | "history.changesSince"
  | "history.hideChanges"
  | "history.showSinceOpened"
  | "history.dismissSinceOpened"
  | "history.backToWorking"
  | "history.nextChange"
  | "history.previousChange"
  | "history.restore"
  | "history.restoreScene"
  | "history.restoreBefore"
  | "history.seeWhatChanged"
  | "doc.openBeside"
  | "history.whoWrote";

export function historyHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, HistoryCommandId> {
  let loaded: Promise<Readonly<Record<HistoryCommandId, () => void>>> | null =
    null;
  const run = (id: HistoryCommandId) => (): void => {
    loaded ??= import("../history/history-commands.ts").then((module) =>
      module.createHistoryCommands(deps),
    );
    void loaded.then((commands) => commands[id]());
  };
  return {
    "history.markVersion": run("history.markVersion"),
    "history.nameDraft": run("history.nameDraft"),
    "history.changesSince": run("history.changesSince"),
    "history.hideChanges": run("history.hideChanges"),
    "history.showSinceOpened": run("history.showSinceOpened"),
    "history.dismissSinceOpened": run("history.dismissSinceOpened"),
    "history.backToWorking": run("history.backToWorking"),
    "history.nextChange": run("history.nextChange"),
    "history.previousChange": run("history.previousChange"),
    "history.restore": run("history.restore"),
    "history.restoreScene": run("history.restoreScene"),
    "history.restoreBefore": run("history.restoreBefore"),
    "history.seeWhatChanged": run("history.seeWhatChanged"),
    "doc.openBeside": run("doc.openBeside"),
    "history.whoWrote": run("history.whoWrote"),
  };
}
