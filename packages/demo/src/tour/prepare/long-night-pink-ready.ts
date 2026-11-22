// Ready while The Long Night's Pink pages are not issued.
import type { TourPreparation } from "./index.ts";
import { READY, USED, issuedSet, stateOf } from "./seeded-doc.ts";

export const LONG_NIGHT_PINK_READY: TourPreparation = {
  id: "long-night-pink-ready",
  async run(driver) {
    const state = await stateOf(
      driver,
      "priya",
      "medium/the-long-night/script",
    );
    return issuedSet(state, "pink") === null ? READY : USED;
  },
};
