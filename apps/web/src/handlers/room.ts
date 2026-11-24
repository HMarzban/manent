// The handlers of working in one room: Follow, Present to the room, and Take keys.
import type { CommandHandlers } from "@manent/commands";
import type { HandlerDeps } from "./index.ts";

const follow = () => import("../room/follow.ts");
const driver = () => import("../room/driver.ts");
const presentWindow = () => import("../screens/present/open-window.ts");

export function roomHandlers(
  deps: HandlerDeps,
): Pick<
  CommandHandlers,
  "room.follow" | "room.stopFollowing" | "room.takeKeys" | "view.presentToRoom"
> {
  return {
    "room.follow": () => {
      void follow().then((module) =>
        module.startFollowing({ services: deps.services, frame: deps.frame }),
      );
    },
    "room.stopFollowing": () => {
      void follow().then((module) => module.stopFollowing());
    },
    "room.takeKeys": () => {
      const docId = deps.shellState().docId;
      if (docId === null) return;
      void driver().then((module) => {
        const current = module.currentDriver(deps.services.userId, docId);
        if (current === null || current.userId === deps.services.userId) return;
        return module.takeDriver(docId, current.userId, deps.services, {
          announceLoss: true,
        });
      });
    },
    "view.presentToRoom": () => {
      const docId = deps.shellState().docId;
      if (docId === null) return;
      void presentWindow().then((module) =>
        module.openPresentWindow(docId, "room"),
      );
    },
  };
}
