// One tab of a panel, as a panel's tab list registers it.
import type { ComponentType } from "react";

export interface PanelTab<Id extends string> {
  readonly id: Id;
  /** A hook: present only when the document's state gives the tab something to hold. */
  useTab(docId: string | null): { present: boolean; label: string };
  readonly Tab: ComponentType<{ docId: string | null }>;
}
