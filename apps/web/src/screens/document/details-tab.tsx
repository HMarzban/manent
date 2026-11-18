import type { PanelTab } from "../../shell/panel-tab.ts";

export const detailsTab: PanelTab<"details"> = {
  id: "details",
  useTab: () => ({ present: false, label: "" }),
  Tab: () => null,
};
