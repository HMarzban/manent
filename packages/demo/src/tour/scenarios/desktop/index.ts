// The Tour's Desktop scenarios, in the order the Tour shows them.
import type { TourScenario } from "../../format.ts";
import { DESKTOP_OFFLINE } from "./desktop-offline.ts";
import { DESKTOP_FIRST_SCRIPT } from "./desktop-first-script.ts";
import { DESKTOP_OPEN_IN_BROWSER } from "./desktop-open-in-browser.ts";
import { DESKTOP_FILES } from "./desktop-files.ts";
import { DESKTOP_PROMPTER_FILES } from "./desktop-prompter-files.ts";

export const DESKTOP: readonly TourScenario[] = [
  DESKTOP_OFFLINE,
  DESKTOP_FIRST_SCRIPT,
  DESKTOP_OPEN_IN_BROWSER,
  DESKTOP_FILES,
  DESKTOP_PROMPTER_FILES,
];
