import type { PanelTab } from "../../shell/panel-tab.ts";

export const historyTab: PanelTab<"history"> = {
  id: "history",
  useTab: () => ({ present: false, label: "" }),
  Tab: () => null,
};
