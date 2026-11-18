// The side panel of a document: the side position with the document's side tabs.
import type { ReactNode } from "react";
import { SidePosition } from "../../shell/side-position.tsx";
import { usePanel } from "../../state/panels.store.ts";
import { PanelPlace } from "./panel-surface.tsx";
import { SIDE_PANEL_TABS } from "./side-tabs.ts";

/** `overlay` draws the open panel over the page, at its end. */
export function SidePanel(props: {
  docId: string;
  overlay: boolean;
}): ReactNode {
  const open = usePanel("side").tab !== null;
  return (
    <PanelPlace over={props.overlay && open ? "end" : null}>
      <SidePosition docId={props.docId} tabs={SIDE_PANEL_TABS} />
    </PanelPlace>
  );
}
