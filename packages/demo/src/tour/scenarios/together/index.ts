// The Tour's Work together scenarios, in the order the Tour shows them.
import type { TourScenario } from "../../format.ts";
import { TOGETHER_CURSORS } from "./together-cursors.ts";
import { TOGETHER_TWO_TABS } from "./together-two-tabs.ts";
import { TOGETHER_ADD_WRITERS } from "./together-add-writers.ts";
import { TOGETHER_ROLES } from "./together-roles.ts";
import { TOGETHER_SETTINGS } from "./together-settings.ts";
import { TOGETHER_FOLLOW } from "./together-follow.ts";
import { TOGETHER_COMMENTS } from "./together-comments.ts";
import { TOGETHER_READER } from "./together-reader.ts";
import { TOGETHER_SUGGEST } from "./together-suggest.ts";
import { TOGETHER_PRESENT } from "./together-present.ts";
import { TOGETHER_PRIVATE } from "./together-private.ts";
import { TOGETHER_NOTE } from "./together-note.ts";
import { TOGETHER_SHARE } from "./together-share.ts";
import { TOGETHER_STYLE } from "./together-style.ts";
import { TOGETHER_LINKS } from "./together-links.ts";
import { TOGETHER_WORKSPACE_SETTINGS } from "./together-workspace-settings.ts";
import { TOGETHER_CAN_ALSO } from "./together-can-also.ts";

export const TOGETHER: readonly TourScenario[] = [
  TOGETHER_CURSORS,
  TOGETHER_TWO_TABS,
  TOGETHER_ADD_WRITERS,
  TOGETHER_ROLES,
  TOGETHER_SETTINGS,
  TOGETHER_FOLLOW,
  TOGETHER_COMMENTS,
  TOGETHER_READER,
  TOGETHER_SUGGEST,
  TOGETHER_PRESENT,
  TOGETHER_PRIVATE,
  TOGETHER_NOTE,
  TOGETHER_SHARE,
  TOGETHER_STYLE,
  TOGETHER_LINKS,
  TOGETHER_WORKSPACE_SETTINGS,
  TOGETHER_CAN_ALSO,
];
