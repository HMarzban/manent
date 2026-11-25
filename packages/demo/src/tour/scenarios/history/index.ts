// The Tour's History scenarios, in the order the Tour shows them.
import type { TourScenario } from "../../format.ts";
import { HISTORY_EVERY_VERSION } from "./history-every-version.ts";
import { HISTORY_CHANGES_SINCE } from "./history-changes-since.ts";
import { HISTORY_CHANGES_PROSE } from "./history-changes-prose.ts";
import { HISTORY_RESTORE_SCENE } from "./history-restore-scene.ts";
import { HISTORY_NAME_DRAFT } from "./history-name-draft.ts";
import { HISTORY_WHO_WROTE } from "./history-who-wrote.ts";
import { HISTORY_VIEW_VERSION } from "./history-view-version.ts";
import { HISTORY_RESTORE_REVERSE } from "./history-restore-reverse.ts";
import { HISTORY_SEND_DRAFT } from "./history-send-draft.ts";
import { HISTORY_VERSION_LINK } from "./history-version-link.ts";

export const HISTORY: readonly TourScenario[] = [
  HISTORY_EVERY_VERSION,
  HISTORY_CHANGES_SINCE,
  HISTORY_CHANGES_PROSE,
  HISTORY_RESTORE_SCENE,
  HISTORY_NAME_DRAFT,
  HISTORY_WHO_WROTE,
  HISTORY_VIEW_VERSION,
  HISTORY_RESTORE_REVERSE,
  HISTORY_SEND_DRAFT,
  HISTORY_VERSION_LINK,
];
