import type { PanelTab } from "../../shell/panel-tab.ts";

export const scenesTab: PanelTab<"scenes"> = {
  id: "scenes",
  useTab: () => ({ present: false, label: "" }),
  Tab: () => null,
};
