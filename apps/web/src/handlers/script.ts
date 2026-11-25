// Handlers for Script menu writing-tool commands (Rename character, Read aloud, Goal, Sprint).
import type { CommandHandlers } from "@manent/commands";
import { startReadAloud, stopReadAloud } from "../read-aloud/runner.ts";
import { startRenameCharacter } from "../writing-tools/rename.ts";
import type { HandlerDeps } from "./index.ts";

export function scriptHandlers(
  deps: HandlerDeps,
): Pick<
  CommandHandlers,
  | "script.renameCharacter"
  | "readAloud.start"
  | "readAloud.stop"
  | "script.goal"
  | "sprint.start"
  | "sprint.end"
> {
  return {
    "script.renameCharacter": () => startRenameCharacter(deps),
    "readAloud.start": () => startReadAloud(deps),
    "readAloud.stop": () => stopReadAloud(),
    "script.goal": () => {
      void import("../screens/document/details-tab.tsx").then(
        ({ openDetailsAt }) => openDetailsAt("script", deps.frame),
      );
    },
    "sprint.start": () => {
      void import("../goals/sprint.ts").then(({ promptStartSprint }) =>
        promptStartSprint(deps),
      );
    },
    "sprint.end": () => {
      void import("../goals/sprint.ts").then(({ endSprint }) => endSprint());
    },
  };
}
