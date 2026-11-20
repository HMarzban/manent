// The handlers of the desktop app's commands.
import type { HandlerDeps } from "./index.ts";

export function createDesktopHandlers(
  _deps: HandlerDeps,
): Readonly<Record<string, () => void>> {
  return {};
}
