import type { CommandHandlers } from "@manent/commands";
import { showAlternatesIn } from "../editor-host/material.ts";
import type { HandlerDeps } from "./index.ts";

export function materialHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "alternate.show" | "alternate.add"> {
  const show = (focus: "list" | "field"): void => {
    const { docId } = deps.shellState();
    if (docId !== null) showAlternatesIn(docId, focus);
  };
  return {
    "alternate.show": () => show("list"),
    "alternate.add": () => show("field"),
  };
}
