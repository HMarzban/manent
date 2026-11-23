import type { ReactNode } from "react";
import { ProjectRow } from "../project-list.tsx";
import type { ProjectViewProps } from "../project-views.ts";

/** A series drawn as the row of any other kind until it has a view of its own. */
export function SeriesView(props: ProjectViewProps): ReactNode {
  return <ProjectRow {...props} />;
}
