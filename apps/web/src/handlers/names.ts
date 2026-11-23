import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";

export function namesHandlers(
  _deps: HandlerDeps,
): Pick<CommandHandlers, never> {
  return {};
}
