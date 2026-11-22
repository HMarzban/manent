// As Sam, sets The Lamp Room's paper to US Letter when it is not.
import type { TourPreparation } from "./index.ts";
import { settleSetting } from "./seeded-doc.ts";

export const LAMP_ROOM_US_LETTER: TourPreparation = {
  id: "lamp-room-us-letter",
  run: (driver) =>
    settleSetting(driver, "sam", {
      key: "medium/the-lamp-room/script",
      setting: "script.paper",
      value: "letter",
    }),
};
