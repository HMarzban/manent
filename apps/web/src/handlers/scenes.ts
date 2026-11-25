import type { CommandHandlers } from "@manent/commands";
import { SCENE_MOVE_WORDS, messageFor } from "@manent/ui";
import { moveFocusedScene } from "../scenes/moves.ts";
import type { HandlerDeps } from "./index.ts";

type MoveCommandId = "scene.moveUp" | "scene.moveDown";

export function scenesHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, MoveCommandId> {
  // the command's context cannot tell which row has focus, so the handler says why nothing moved
  const move = (id: MoveCommandId, by: number) => (): void => {
    if (moveFocusedScene(by)) return;
    const { commands, messages } = deps.services;
    messages.push(
      messageFor({
        kind: "command_unavailable",
        label: commands.state(id).label,
        reason: SCENE_MOVE_WORDS.noScene,
      }),
    );
  };
  return {
    "scene.moveUp": move("scene.moveUp", -1),
    "scene.moveDown": move("scene.moveDown", 1),
  };
}
