// Handlers for Script menu writing-tool commands (Rename character, Read aloud).
import type { CommandHandlers } from "@manent/commands";
import { startReadAloud, stopReadAloud } from "../read-aloud/runner.ts";
import { startRenameCharacter } from "../writing-tools/rename.ts";
import type { HandlerDeps } from "./index.ts";

export function scriptHandlers(
  deps: HandlerDeps,
): Pick<
  CommandHandlers,
  "script.renameCharacter" | "readAloud.start" | "readAloud.stop"
> {
  return {
    "script.renameCharacter": () => startRenameCharacter(deps),
    "readAloud.start": () => startReadAloud(deps),
    "readAloud.stop": () => stopReadAloud(),
  };
}
