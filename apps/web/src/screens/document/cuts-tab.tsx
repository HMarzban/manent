// The left panel's Cuts tab: present while a cut exists or while it is the open tab, and absent for commenters and viewers.
import { MATERIAL_WORDS } from "@manent/ui";
import type { ReactNode } from "react";
import { CutsList } from "../../material/cuts/cuts-list.tsx";
import type { PanelTab } from "../../shell/panel-tab.ts";
import { useMaterialCutCount } from "../../state/material.store.ts";
import { usePanel } from "../../state/panels.store.ts";
import { useCanEdit } from "./ruler-bar.tsx";

function CutsTab(props: { docId: string | null }): ReactNode {
  const canEdit = useCanEdit(props.docId ?? "");
  if (props.docId === null || !canEdit) return null;
  return <CutsList docId={props.docId} />;
}

export const cutsTab: PanelTab<"cuts"> = {
  id: "cuts",
  useTab(docId) {
    const canEdit = useCanEdit(docId ?? "");
    const cuts = useMaterialCutCount(docId);
    const { tab } = usePanel("left");
    return {
      present: docId !== null && canEdit && (cuts > 0 || tab === "cuts"),
      label: MATERIAL_WORDS.cuts,
    };
  },
  Tab: CutsTab,
};
