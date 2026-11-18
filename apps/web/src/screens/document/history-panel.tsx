// The History tab's panel, loaded apart from the entry: the visible sections, in list order, each inside its own surface state.
import { SurfaceState } from "@manent/ui";
import type { ReactNode } from "react";
import type { HistorySection } from "./history-sections.ts";
import { panelRenderers } from "./panel-surface.tsx";

const READY = Object.freeze({ kind: "ready" });

export function HistoryPanel(props: {
  docId: string;
  sections: readonly HistorySection[];
}): ReactNode {
  const { docId } = props;
  return props.sections.map(({ id, Section }) => (
    <SurfaceState
      key={id}
      surface="side_panel"
      state={READY}
      render={panelRenderers({
        ready: () => <Section docId={docId} />,
        empty: () => null,
      })}
    />
  ));
}
