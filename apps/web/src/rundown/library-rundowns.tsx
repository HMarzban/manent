import type { ReactNode } from "react";
import { ProjectRow } from "../screens/library/project-list.tsx";
import type { ProjectViewProps } from "../screens/library/project-views.ts";

/** A show or news project drawn as the row of any other kind until it lists its rundowns. */
export function RundownsView(props: ProjectViewProps): ReactNode {
  return <ProjectRow {...props} />;
}
