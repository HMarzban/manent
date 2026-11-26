import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const WRITE_INLINE_GRAPHICS: TourScenario = {
  id: "write-inline-graphics",
  group: "Write",
  promise:
    "Place a lower third or graphic straight into a script, adjust its height, and keep working offline.",
  setup: setupOf({
    userId: "ana",
    open: docPath("medium/lannick-one-news/stories/01"),
  }),
  steps: [
    {
      text: "Open the command palette and choose Insert lower third, then type the presenter's caption on the page.",
      highlight: "graphics.insertLowerThird",
    },
    {
      text: "Open Details → Selection → Graphic and change Height from 6 to 8 lines.",
      highlight: "details:graphic",
    },
    {
      text: "Switch Connection to Offline, drop or pick an image onto the graphic, and reload: the image stays on this device.",
      highlight: "demo:connection",
    },
  ],
  check:
    'The page shows the "Lower third" block with its caption and updated "Height", and the image survives a reload while offline.',
  evidence: ["Lower third", "Height"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
