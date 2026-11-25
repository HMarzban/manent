// The handlers of working in one room: Follow, Present to the room, Take keys, and Pitch.
import type { CommandHandlers } from "@manent/commands";
import { ROOM_WORDS, messageFor } from "@manent/ui";
import type { HandlerDeps } from "./index.ts";

const follow = () => import("../room/follow.ts");
const driver = () => import("../room/driver.ts");
const pitch = () => import("../room/pitch.ts");
const pitchRoot = () => import("../room/pitch-root.ts");
const presentWindow = () => import("../screens/present/open-window.ts");

export function roomHandlers(
  deps: HandlerDeps,
): Pick<
  CommandHandlers,
  | "room.follow"
  | "room.stopFollowing"
  | "room.takeKeys"
  | "room.pitch"
  | "view.presentToRoom"
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
    "room.pitch": () => {
      const docId = deps.shellState().docId;
      if (docId === null) return;
      deps.dom.rememberFocus();
      void Promise.all([driver(), pitch(), pitchRoot()]).then(
        ([driverMod, pitchMod, pitchRootMod]) => {
          const current = driverMod.currentDriver(deps.services.userId, docId);
          if (current === null || current.userId === deps.services.userId)
            return;
          if (!driverMod.canEditDriverDoc(deps.services.userId, docId)) return;
          if (!pitchMod.canPitchInEditor(docId)) return;
          const blockId = pitchMod.driverSpeechBlockId(docId, current.userId);
          if (blockId === null) {
            deps.services.messages.push(
              messageFor({
                kind: "command_unavailable",
                label: ROOM_WORDS.pitchAction,
                reason: ROOM_WORDS.pitchNeedsSpeech(
                  driverMod.firstNameOf(current.name),
                ),
              }),
            );
            return;
          }
          pitchRootMod.openPitchPopover({
            docId,
            blockId,
            authorUserId: deps.services.userId,
            onRestoreFocus: () => deps.dom.restoreFocus(),
          });
        },
      );
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
