// As Sam, sets The Lamp Room's paper to US Letter when it is not.
import type { TourPreparation } from "./index.ts";

export const LAMP_ROOM_US_LETTER: TourPreparation = {
  id: "lamp-room-us-letter",
  run: async () => ({ ok: false, reason: "unknown" }),
};
