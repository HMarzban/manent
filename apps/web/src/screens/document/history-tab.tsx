// The side panel's History tab: present while a section has something, drawing those sections in list order.
import { DOCUMENT_WORDS } from "@manent/ui";
import { Suspense, lazy, useEffect } from "react";
import type { ReactNode } from "react";
import type { PanelTab } from "../../shell/panel-tab.ts";
import { HISTORY_SECTIONS } from "./history-sections.ts";
import type { HistorySection } from "./history-sections.ts";
import { PanelListSkeleton } from "./panel-surface.tsx";

// the shell reads this tab's presence from the entry, which the panel's components would push over its size budget
const loadPanel = () => import("./history-panel.tsx");
const HistoryPanel = lazy(async () => ({
  default: (await loadPanel()).HistoryPanel,
}));

/** The sections with something to show; every section's hook runs, in list order, on every render. */
function useVisibleSections(docId: string): readonly HistorySection[] {
  return HISTORY_SECTIONS.filter((section) => section.useVisible(docId));
}

function HistoryTab(props: { docId: string | null }): ReactNode {
  const { docId } = props;
  const sections = useVisibleSections(docId ?? "");
  if (docId === null) return null;
  return (
    <Suspense fallback={<PanelListSkeleton />}>
      <HistoryPanel docId={docId} sections={sections} />
    </Suspense>
  );
}

export const historyTab: PanelTab<"history"> = {
  id: "history",
  useTab(docId) {
    // off a document the sections' hooks still run, so that the hooks of this tab keep their order
    const visible = useVisibleSections(docId ?? "");
    const present = docId !== null && visible.length > 0;
    // fetched once the tab has something to hold, so it is ready before it is opened
    useEffect(() => {
      if (present) void loadPanel();
    }, [present]);
    return { present, label: DOCUMENT_WORDS.historyTab };
  },
  Tab: HistoryTab,
};
