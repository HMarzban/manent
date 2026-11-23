// The Present screen's modes, one line each: what each window draws over its document.
import type { ReactNode } from "react";
import { RoomMode } from "./room/room-mode.tsx";

export interface PresentMode {
  readonly id: "room" | "prompter";
  readonly Body: (props: { docId: string }) => ReactNode;
}

/** A mode with no line here is not found at its address. */
export const PRESENT_MODES: readonly PresentMode[] = [
  { id: "room", Body: RoomMode },
];
