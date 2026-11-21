// The handlers of the desktop app's commands.
import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";

export function createDesktopHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "app.openInBrowser"> {
  return {
    // shown only in the desktop app, where there is a host
    "app.openInBrowser": () => deps.desktop?.openInBrowser(),
  };
}
