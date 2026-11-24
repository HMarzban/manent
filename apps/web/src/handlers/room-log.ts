// Room log command handlers: Link to beat or scene (asks in place) and Remove link.
import { COMMANDS } from "@manent/commands";
import type { CommandHandlers, CommandId } from "@manent/commands";
import { ROOM_LOG_WORDS, messageFor } from "@manent/ui";
import {
  activeRoomLogDocId,
  canEditRoomLogLine,
  runRoomLogAskLink,
  runRoomLogSetLink,
} from "../room-log/room-log-bridge.ts";
import { readEpisodeTargets } from "../room-log/targets.ts";
import type { RoomLogTarget } from "../room-log/targets.ts";
import type { HandlerDeps } from "./index.ts";

type RoomLogCommandId = Extract<CommandId, `roomLog.${string}`>;

function sayNeedsLine(deps: HandlerDeps, id: RoomLogCommandId): void {
  const label = COMMANDS.find((c) => c.id === id)?.label;
  if (typeof label === "string") {
    deps.services.messages.push(
      messageFor({
        kind: "command_unavailable",
        label,
        reason: ROOM_LOG_WORDS.needsLine,
      }),
    );
  }
}

export function roomLogHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, RoomLogCommandId> {
  return {
    "roomLog.link"() {
      const targetDocId = activeRoomLogDocId(deps.shellState().docId);
      if (targetDocId === null || !canEditRoomLogLine(targetDocId)) {
        sayNeedsLine(deps, "roomLog.link");
        return;
      }
      void readEpisodeTargets(deps.services, targetDocId).then((episode) => {
        const choices: readonly RoomLogTarget[] = [
          ...episode.scenes,
          ...episode.beats,
        ];
        if (choices.length === 0) return;
        const opened = runRoomLogAskLink(
          targetDocId,
          choices.map((item) => item.pickerLabel),
          (index) => {
            const picked = choices[index];
            if (picked === undefined) return;
            runRoomLogSetLink(targetDocId, {
              kind: picked.kind,
              blockId: picked.blockId,
            });
          },
        );
        if (!opened) sayNeedsLine(deps, "roomLog.link");
      });
    },
    "roomLog.unlink"() {
      const targetDocId = activeRoomLogDocId(deps.shellState().docId);
      if (targetDocId === null || !canEditRoomLogLine(targetDocId)) {
        sayNeedsLine(deps, "roomLog.unlink");
        return;
      }
      if (!runRoomLogSetLink(targetDocId, null))
        sayNeedsLine(deps, "roomLog.unlink");
    },
  };
}
