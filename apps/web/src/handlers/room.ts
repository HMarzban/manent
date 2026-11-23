// The handlers of following another person's caret; the controller loads apart from the entry the first time one runs.
import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";

const follow = () => import("../room/follow.ts");

export function roomHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "room.follow" | "room.stopFollowing"> {
  return {
    "room.follow": () => {
      void follow().then((module) =>
        module.startFollowing({ services: deps.services, frame: deps.frame }),
      );
    },
    "room.stopFollowing": () => {
      void follow().then((module) => module.stopFollowing());
    },
  };
}
