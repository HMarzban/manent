// Thin handlers for the prompter commands, calling the stores each feature lane fills.
import type { CommandHandlers } from "@manent/commands";
import { PROMPTER_WINDOW_WORDS } from "@manent/ui";
import { prompterFilesStore } from "../prompter-files/store.ts";
import { prompterWindowActions } from "../state/prompter-window.store.ts";
import { prompterActions } from "../state/prompter.store.ts";
import type { HandlerDeps } from "./index.ts";

const PROMPTER_POPUP_BLOCKED_ID = "prompter.popup_blocked";

type PrompterCommandId =
  | "prompter.send"
  | "prompter.sendPrevious"
  | "view.presentOnPrompter"
  | "prompter.files"
  | "prompter.reopenFiles"
  | "prompter.stopFiles"
  | "prompter.takeControl"
  | "prompter.takeOver"
  | "prompter.stopControlling"
  | "prompter.jumpHere";

export function prompterHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, PrompterCommandId> {
  const onDoc = (run: (docId: string) => void) => (): void => {
    const { docId } = deps.shellState();
    if (docId !== null) run(docId);
  };
  return {
    "prompter.send": onDoc((docId) => prompterActions.send(docId)),
    "prompter.sendPrevious": onDoc((docId) =>
      prompterActions.sendPrevious(docId),
    ),
    "view.presentOnPrompter": onDoc((docId) => {
      if (prompterWindowActions.open(docId)) return;
      deps.services.messages.withdraw(PROMPTER_POPUP_BLOCKED_ID);
      deps.services.messages.push({
        id: PROMPTER_POPUP_BLOCKED_ID,
        text: PROMPTER_WINDOW_WORDS.popupBlocked,
        actions: [],
        lifetime: "brief",
        ownWork: false,
      });
    }),
    "prompter.files": onDoc((docId) => prompterFilesStore.open(docId)),
    "prompter.reopenFiles": () =>
      prompterFilesStore.reopen(deps.shellState().docId),
    "prompter.stopFiles": () => prompterFilesStore.stop(),
    "prompter.takeControl": onDoc((docId) =>
      prompterActions.takeControl(docId),
    ),
    "prompter.takeOver": onDoc((docId) => prompterActions.takeOver(docId)),
    "prompter.stopControlling": onDoc((docId) =>
      prompterActions.stopControlling(docId),
    ),
    "prompter.jumpHere": onDoc((docId) => prompterActions.jumpHere(docId)),
  };
}
