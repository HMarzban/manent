// The BESIDE_KINDS entry for a series episode's room log.
import type { BesideKind } from "../beside/kinds.ts";
import { roomLogChoices } from "./episode-room-log.ts";
import { RoomLogBeside, useRoomLogTitle } from "./room-log-beside.tsx";

export const ROOM_LOG_BESIDE_KIND: BesideKind = {
  id: "room_log",
  title: useRoomLogTitle,
  hasStatus: true,
  Body: RoomLogBeside,
  choices: roomLogChoices,
};
