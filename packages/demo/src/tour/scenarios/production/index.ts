// The Tour's Production scenarios, in the order the Tour shows them.
import type { TourScenario } from "../../format.ts";
import { PRODUCTION_LOCK } from "./production-lock.ts";
import { PRODUCTION_LOCKED_PAGE } from "./production-locked-page.ts";
import { PRODUCTION_ISSUE_BLUE } from "./production-issue-blue.ts";
import { PRODUCTION_RECALL } from "./production-recall.ts";
import { PRODUCTION_ISSUE_NEXT } from "./production-issue-next.ts";
import { PRODUCTION_OMIT } from "./production-omit.ts";
import { PRODUCTION_LOCK_COPY } from "./production-lock-copy.ts";
import { PRODUCTION_SIDES } from "./production-sides.ts";
import { PRODUCTION_NIGHTLY } from "./production-nightly.ts";

export const PRODUCTION: readonly TourScenario[] = [
  PRODUCTION_LOCK,
  PRODUCTION_LOCKED_PAGE,
  PRODUCTION_ISSUE_BLUE,
  PRODUCTION_RECALL,
  PRODUCTION_ISSUE_NEXT,
  PRODUCTION_OMIT,
  PRODUCTION_LOCK_COPY,
  PRODUCTION_SIDES,
  PRODUCTION_NIGHTLY,
];
