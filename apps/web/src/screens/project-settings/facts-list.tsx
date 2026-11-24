// Names and facts' list of the pinned facts of the project the screen's address names.
import { useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { FactsListView } from "../../facts/facts-list-view.tsx";

export function FactsList(): ReactNode {
  const { projectId }: { projectId: string } = useParams({ strict: false });
  return <FactsListView projectId={projectId} />;
}
