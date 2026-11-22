// Ready while Salt's Blue pages are not issued.
import type { TourPreparation } from "./index.ts";
import { READY, USED, issuedSet, stateOf } from "./seeded-doc.ts";

export const SALT_BLUE_READY: TourPreparation = {
  id: "salt-blue-ready",
  async run(driver) {
    const state = await stateOf(driver, "priya", "medium/harbour-lights/202");
    return issuedSet(state, "blue") === null ? READY : USED;
  },
};
