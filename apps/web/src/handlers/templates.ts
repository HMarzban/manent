// Handler for `template.save`: remembers focus and opens the Save template dialog.
import type { CommandHandlers } from "@manent/commands";
import { dialogActions } from "../state/dialog.store.ts";
import type { HandlerDeps } from "./index.ts";

export function templateHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "template.save"> {
  return {
    "template.save"() {
      deps.dom.rememberFocus();
      dialogActions.open("save_template");
    },
  };
}
