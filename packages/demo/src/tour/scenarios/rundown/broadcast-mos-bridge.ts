import type { TourScenario } from "../../format.ts";
import { setupOf } from "../setup.ts";

export const BROADCAST_MOS_BRIDGE: TourScenario = {
  id: "broadcast-mos-bridge",
  group: "Rundown and prompter",
  promise:
    "Connect a workspace to an external Autoscript or MOS prompter and send a rundown live.",
  setup: setupOf({
    userId: "dana",
    open: "/",
  }),
  steps: [
    {
      text: "Choose Autoscript WinPlus-IP, enter the prompter address, and choose Save and Check prompter.",
      highlight: "mos:save",
    },
    {
      text: "Open Lannick One News today's rundown, open Details → Rundown, and turn on Send this rundown over MOS.",
      highlight: "rundown:mos_toggle",
    },
    {
      text: "Edit a story inside the air window, then choose Send to prompter so the external prompter receives the new text.",
      highlight: "prompter.send",
    },
  ],
  check:
    'Broadcast settings shows "Live", Details shows "Send this rundown over MOS", and inside the air window the external prompter waits until "Send to prompter" is chosen.',
  evidence: ["Live", "Send this rundown over MOS", "Send to prompter"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
