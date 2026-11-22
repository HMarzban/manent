// Finding and moving through the open script: the Find bar, the next and previous scene, and Where am I?
import type { CommandHandlers } from "@manent/commands";
import { findActions } from "../state/find.store.ts";
import { whereActions } from "../state/where.store.ts";
import type { HandlerDeps } from "./index.ts";

export function navigationHandlers(
  deps: HandlerDeps,
): Pick<
  CommandHandlers,
  "edit.find" | "nav.nextScene" | "nav.previousScene" | "nav.whereAmI"
> {
  const { editor } = deps.services;
  return {
    "edit.find": () => findActions.open(),
    "nav.nextScene": () => editor.run({ kind: "step_scene", direction: 1 }),
    "nav.previousScene": () =>
      editor.run({ kind: "step_scene", direction: -1 }),
    "nav.whereAmI": () => whereActions.ask(),
  };
}
