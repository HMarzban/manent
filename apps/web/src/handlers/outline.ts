import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";

export function outlineHandlers(
  _deps: HandlerDeps,
): Pick<CommandHandlers, never> {
  return {};
}
