// Handler for Focus mode.
import type { CommandHandlers } from "@manent/commands";
import { focusModeActions } from "../state/focus-mode.store.ts";
import type { HandlerDeps } from "./index.ts";

export function focusModeHandlers(
  _deps: HandlerDeps,
): Pick<CommandHandlers, "view.focusMode"> {
  return {
    "view.focusMode": () => focusModeActions.toggle(),
  };
}
