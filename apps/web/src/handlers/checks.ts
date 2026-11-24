import type { CommandHandlers } from "@manent/commands";
import { bindChecksServices } from "../checks/checks-context.ts";
import type { HandlerDeps } from "./index.ts";

export function checksHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, never> {
  bindChecksServices(deps.services);
  return {};
}
