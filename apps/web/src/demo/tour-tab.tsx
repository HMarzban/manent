import type { PanelTab } from "../shell/panel-tab.ts";

export const tourTab: PanelTab<"tour"> = {
  id: "tour",
  useTab: () => ({ present: false, label: "" }),
  Tab: () => null,
};
