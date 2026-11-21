// The Tour this build ships.
import { TOUR_GROUPS } from "./format.ts";
import type { TourFile } from "./format.ts";
import { TOUR_SCENARIOS } from "./scenarios/index.ts";

export const TOUR: TourFile = Object.freeze({
  formatVersion: 2,
  groups: TOUR_GROUPS,
  scenarios: TOUR_SCENARIOS,
});
