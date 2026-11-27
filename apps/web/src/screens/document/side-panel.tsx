// The side position of a document: its side tabs, or what is open beside the page, one at a time.
import { useEffect } from "react";
import type { ReactNode } from "react";
import { BesidePanel } from "../../beside/beside-panel.tsx";
import { closeBeside, useBeside } from "../../beside/open-beside.ts";
import { SidePosition } from "../../shell/side-position.tsx";
import { usePanel } from "../../state/panels.store.ts";
import { PanelPlace } from "./panel-surface.tsx";
import { SIDE_PANEL_TABS } from "./side-tabs.ts";

/** `overlay` draws the open panel over the page, at its end. Opening a side tab closes what is beside the page. */
export function SidePanel(props: {
  docId: string;
  overlay: boolean;
}): ReactNode {
  const sideTab = usePanel("side").tab;
  const open = sideTab !== null;
  const beside = useBeside();
  useEffect(() => {
    if (open && sideTab !== "tour") closeBeside();
  }, [open, sideTab]);
  // leaving or switching the document closes what is beside it
  useEffect(() => closeBeside, [props.docId]);
  return (
    <>
      <PanelPlace over={props.overlay && open ? "end" : null}>
        <SidePosition docId={props.docId} tabs={SIDE_PANEL_TABS} />
      </PanelPlace>
      {beside === null ||
      (beside.docId === props.docId &&
        beside.kind !== "ink_player" &&
        beside.kind !== "game_player") ? null : (
        <BesidePanel open={beside} />
      )}
    </>
  );
}
