import type { ReactNode } from "react";
import type { PanelTab } from "../../shell/panel-tab.ts";

function CutsTab(): ReactNode {
  return null;
}

export const cutsTab: PanelTab<"cuts"> = {
  id: "cuts",
  useTab: () => ({ present: false, label: "" }),
  Tab: CutsTab,
};
