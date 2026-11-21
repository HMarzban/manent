import { PRODUCTION_WORDS } from "@manent/ui";
import type { PanelTab } from "../shell/panel-tab.ts";

export const pagesTab: PanelTab<"pages"> = {
  id: "pages",
  useTab: () => ({ present: false, label: PRODUCTION_WORDS.pagesTab }),
  Tab: () => null,
};
