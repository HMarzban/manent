// The left panel's tabs, one line per tab, in display order: Scenes, Pages (later), Cuts (later).
import type { LeftTab } from "@manent/commands";
import type { PanelTab } from "../../shell/panel-tab.ts";
import { scenesTab } from "./scenes-tab.tsx";

export const LEFT_PANEL_TABS: readonly PanelTab<LeftTab>[] = [scenesTab];
