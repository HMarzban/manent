// The versions section of the History tab, loaded apart from the entry with everything it draws.
import { Suspense, lazy } from "react";
import type { ReactNode } from "react";
import { PanelListSkeleton } from "./panel-surface.tsx";

const HistoryVersions = lazy(async () => ({
  default: (await import("./history-versions.tsx")).HistoryVersions,
}));

export function HistoryList(props: { docId: string }): ReactNode {
  return (
    <Suspense fallback={<PanelListSkeleton />}>
      <HistoryVersions docId={props.docId} />
    </Suspense>
  );
}
