// One tab of a panel, as a panel's tab list registers it.
import type { ComponentType } from "react";

export interface PanelTab<Id extends string> {
  readonly id: Id;
  /** When true, opens in dedicated tab-free chrome from its own trigger rather than appearing in the side tab strip. */
  readonly standalone?: boolean;
  /** A hook: present only when the document's state gives the tab something to hold. */
  useTab(docId: string | null): { present: boolean; label: string };
  readonly Tab: ComponentType<{ docId: string | null }>;
}
