import { DOCUMENT_WORDS, useCommandState } from "@manent/ui";
import type { PanelTab } from "../shell/panel-tab.ts";
import { TourPanel } from "./tour-panel.tsx";

export const tourTab: PanelTab<"tour"> = {
  id: "tour",
  // the Tour command is visible exactly in demo mode, where the Tour is present on every screen
  useTab: () => ({
    present: useCommandState("demo.tour").visible,
    label: DOCUMENT_WORDS.tourTab,
  }),
  Tab: TourPanel,
};
