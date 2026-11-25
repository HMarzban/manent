// Handler for Library search command (`library.search`).
import type { CommandHandlers } from "@manent/commands";
import { focusSearchField } from "../search/search-focus.ts";
import type { HandlerDeps } from "./index.ts";

export function searchHandlers(
  _deps: HandlerDeps,
): Pick<CommandHandlers, "library.search"> {
  return {
    "library.search": () => focusSearchField(),
  };
}
