// Thin handlers for the prompter commands, calling the stores each feature lane fills.
import type { CommandHandlers } from "@manent/commands";
import { prompterFilesStore } from "../prompter-files/store.ts";
import { prompterWindowActions } from "../state/prompter-window.store.ts";
import { prompterActions } from "../state/prompter.store.ts";
import type { HandlerDeps } from "./index.ts";

type PrompterCommandId =
  | "prompter.send"
  | "prompter.sendPrevious"
  | "view.presentOnPrompter"
  | "prompter.files"
  | "prompter.stopFiles";

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
    "view.presentOnPrompter": onDoc((docId) =>
      prompterWindowActions.open(docId),
    ),
    "prompter.files": onDoc((docId) => prompterFilesStore.open(docId)),
    "prompter.stopFiles": () => prompterFilesStore.stop(),
  };
}
