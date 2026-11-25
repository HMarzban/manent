// The Tour's Go offline scenarios, in the order the Tour shows them.
import type { TourScenario } from "../../format.ts";
import { OFFLINE_WRITE } from "./offline-write.ts";
import { OFFLINE_OVERLAP } from "./offline-overlap.ts";
import { OFFLINE_RECOVERED } from "./offline-recovered.ts";
import { OFFLINE_SLOW } from "./offline-slow.ts";
import { OFFLINE_SERVER_STOPPED } from "./offline-server-stopped.ts";
import { OFFLINE_REORGANISED } from "./offline-reorganised.ts";
import { OFFLINE_SIGN_OUT } from "./offline-sign-out.ts";

export const OFFLINE: readonly TourScenario[] = [
  OFFLINE_WRITE,
  OFFLINE_OVERLAP,
  OFFLINE_RECOVERED,
  OFFLINE_SLOW,
  OFFLINE_SERVER_STOPPED,
  OFFLINE_REORGANISED,
  OFFLINE_SIGN_OUT,
];
