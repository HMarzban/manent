import { PRODUCTION_OUTPUTS_WORDS } from "@manent/ui";
import type { SendWhatOption } from "./what-options.ts";

export const SIDES_WHAT_OPTION: SendWhatOption = {
  id: "sides_scenes",
  label: PRODUCTION_OUTPUTS_WORDS.rangeOfScenes,
  appliesTo: ["export", "send_draft"],
  transform: null,
  fileTypes: ["sides"],
  lockedOnly: true,
};
