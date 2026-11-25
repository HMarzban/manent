// Handlers for Script menu writing-tool commands.
import type { CommandHandlers } from "@manent/commands";
import { startRenameCharacter } from "../writing-tools/rename.ts";
import type { HandlerDeps } from "./index.ts";

export function scriptHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "script.renameCharacter"> {
  return {
    "script.renameCharacter": () => startRenameCharacter(deps),
  };
}
