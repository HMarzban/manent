// One file per Tour group; one line per group here, in the Tour's order.
import type { TourScenario } from "../format.ts";
import { WRITE } from "./write.ts";
import { TOGETHER } from "./together.ts";
import { OFFLINE } from "./offline.ts";
import { HISTORY } from "./history.ts";
import { PRODUCTION } from "./production.ts";
import { LONG } from "./long.ts";
import { RUNDOWN } from "./rundown.ts";
import { DESKTOP } from "./desktop.ts";

export const TOUR_SCENARIOS: readonly TourScenario[] = [
  ...WRITE,
  ...TOGETHER,
  ...OFFLINE,
  ...HISTORY,
  ...PRODUCTION,
  ...LONG,
  ...RUNDOWN,
  ...DESKTOP,
];
