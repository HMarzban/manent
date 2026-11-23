// The left panel's tabs, one line per tab, in display order: Scenes, Pages, Cuts (later).
import type { LeftTab } from "@manent/commands";
import { pagesTab } from "../../production/pages-tab.tsx";
import type { PanelTab } from "../../shell/panel-tab.ts";
import { cutsTab } from "./cuts-tab.tsx";
import { scenesTab } from "./scenes-tab.tsx";

export const LEFT_PANEL_TABS: readonly PanelTab<LeftTab>[] = [
  scenesTab,
  pagesTab,
  cutsTab,
];
