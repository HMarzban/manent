// The handlers of the commands that bring a file in.
import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";

// nothing reads a file until the importer exists
const nothingYet = (): void => {};

export function importHandlers(
  _deps: HandlerDeps,
): Pick<CommandHandlers, "file.import" | "file.open" | "file.importAgain"> {
  return {
    "file.import": nothingYet,
    "file.open": nothingYet,
    "file.importAgain": nothingYet,
  };
}
