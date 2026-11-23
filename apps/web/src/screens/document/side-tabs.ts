// The side panel's tabs, one line per tab, in display order: Comments (later), History, Details, Tour.
import type { SideTab } from "@manent/commands";
import { commentsTab } from "../../comments/comments-tab.tsx";
import { tourTab } from "../../demo/tour-tab.tsx";
import type { PanelTab } from "../../shell/panel-tab.ts";
import { detailsTab } from "./details-tab.tsx";
import { historyTab } from "./history-tab.tsx";

export const SIDE_PANEL_TABS: readonly PanelTab<SideTab>[] = [
  commentsTab,
  historyTab,
  detailsTab,
  tourTab,
];
