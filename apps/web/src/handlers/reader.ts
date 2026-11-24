// Command handler for the reader frame's `history.sinceLastRead` command.
import type { CommandHandlers } from "@manent/commands";
import { runReaderSinceLastRead } from "../reader/reader-controller.ts";
import type { HandlerDeps } from "./index.ts";

export function readerHandlers(
  _deps: HandlerDeps,
): Pick<CommandHandlers, "history.sinceLastRead"> {
  return {
    "history.sinceLastRead": () => {
      runReaderSinceLastRead();
    },
  };
}
