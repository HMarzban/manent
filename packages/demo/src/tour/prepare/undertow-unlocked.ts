// Ready while Undertow's page numbers are not locked.
import type { TourPreparation } from "./index.ts";
import { READY, USED, stateOf } from "./seeded-doc.ts";

export const UNDERTOW_UNLOCKED: TourPreparation = {
  id: "undertow-unlocked",
  async run(driver) {
    const state = await stateOf(driver, "priya", "medium/harbour-lights/203");
    return state.locked ? USED : READY;
  },
};
