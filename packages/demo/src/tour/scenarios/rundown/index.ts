// The Tour's Rundown and prompter scenarios, in the order the Tour shows them.
import type { TourScenario } from "../../format.ts";
import { RUNDOWN_TIME } from "./rundown-time.ts";
import { RUNDOWN_PROMPTER } from "./rundown-prompter.ts";
import { RUNDOWN_SEND } from "./rundown-send.ts";
import { RUNDOWN_FEED_LOST } from "./rundown-feed-lost.ts";
import { RUNDOWN_PREVIOUS_VALUE } from "./rundown-previous-value.ts";
import { RUNDOWN_NEXT_WEEK } from "./rundown-next-week.ts";
import { RUNDOWN_PRINT } from "./rundown-print.ts";

export const RUNDOWN: readonly TourScenario[] = [
  RUNDOWN_TIME,
  RUNDOWN_PROMPTER,
  RUNDOWN_SEND,
  RUNDOWN_FEED_LOST,
  RUNDOWN_PREVIOUS_VALUE,
  RUNDOWN_NEXT_WEEK,
  RUNDOWN_PRINT,
];
