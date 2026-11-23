import type { ReactNode } from "react";
import type { PanelTab } from "../shell/panel-tab.ts";

function CommentsTab(): ReactNode {
  return null;
}

export const commentsTab: PanelTab<"comments"> = {
  id: "comments",
  useTab: () => ({ present: false, label: "" }),
  Tab: CommentsTab,
};
