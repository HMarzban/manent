import type { CommandHandlers } from "@manent/commands";
import { dialogActions } from "../state/dialog.store.ts";
import type { HandlerDeps } from "./index.ts";

export function shareHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "share.open"> {
  return {
    "share.open"() {
      deps.dom.rememberFocus();
      dialogActions.open("share");
    },
  };
}
