// The handlers of the version history commands.
import type { CommandHandlers } from "@manent/commands";

type HistoryCommandId =
  | "history.markVersion"
  | "history.nameDraft"
  | "history.changesSince"
  | "history.hideChanges"
  | "history.showSinceOpened"
  | "history.backToWorking"
  | "history.nextChange"
  | "history.previousChange"
  | "history.restore"
  | "history.restoreScene"
  | "history.restoreBefore"
  | "history.seeWhatChanged"
  | "history.whoWrote";

// the History tab is not drawn yet, so no command has anything to act on
const nothingYet = (): void => {};

export function historyHandlers(): Pick<CommandHandlers, HistoryCommandId> {
  return {
    "history.markVersion": nothingYet,
    "history.nameDraft": nothingYet,
    "history.changesSince": nothingYet,
    "history.hideChanges": nothingYet,
    "history.showSinceOpened": nothingYet,
    "history.backToWorking": nothingYet,
    "history.nextChange": nothingYet,
    "history.previousChange": nothingYet,
    "history.restore": nothingYet,
    "history.restoreScene": nothingYet,
    "history.restoreBefore": nothingYet,
    "history.seeWhatChanged": nothingYet,
    "history.whoWrote": nothingYet,
  };
}
