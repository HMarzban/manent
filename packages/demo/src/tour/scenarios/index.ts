// One folder per Tour group; one line per group here, in the Tour's order.
import type { TourScenario } from "../format.ts";
import { WRITE } from "./write/index.ts";
import { TOGETHER } from "./together/index.ts";
import { OFFLINE } from "./offline/index.ts";
import { HISTORY } from "./history/index.ts";
import { PRODUCTION } from "./production/index.ts";
import { LONG } from "./long/index.ts";
import { RUNDOWN } from "./rundown/index.ts";
import { DESKTOP } from "./desktop/index.ts";

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
