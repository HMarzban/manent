// The Tour's Rundown and prompter scenarios, in the order the Tour shows them.
import type { TourScenario } from "../../format.ts";
import { RUNDOWN_TIME } from "./rundown-time.ts";
import { RUNDOWN_PROMPTER } from "./rundown-prompter.ts";
import { RUNDOWN_SEND } from "./rundown-send.ts";
import { RUNDOWN_FEED_LOST } from "./rundown-feed-lost.ts";
import { RUNDOWN_PREVIOUS_VALUE } from "./rundown-previous-value.ts";
import { RUNDOWN_NEXT_WEEK } from "./rundown-next-week.ts";
import { RUNDOWN_PRINT } from "./rundown-print.ts";
import { RUNDOWN_REMOTE_PROMPTER } from "./rundown-remote-prompter.ts";
import { BROADCAST_MOS_BRIDGE } from "./broadcast-mos-bridge.ts";
import { RUNDOWN_SHOW_TEMPLATE } from "./rundown-show-template.ts";
import { RUNDOWN_VIEW_AND_HISTORY } from "./rundown-view-and-history.ts";

export const RUNDOWN: readonly TourScenario[] = [
  RUNDOWN_TIME,
  RUNDOWN_PROMPTER,
  RUNDOWN_SEND,
  RUNDOWN_FEED_LOST,
  RUNDOWN_PREVIOUS_VALUE,
  RUNDOWN_NEXT_WEEK,
  RUNDOWN_PRINT,
  RUNDOWN_REMOTE_PROMPTER,
  BROADCAST_MOS_BRIDGE,
  RUNDOWN_SHOW_TEMPLATE,
  RUNDOWN_VIEW_AND_HISTORY,
];
