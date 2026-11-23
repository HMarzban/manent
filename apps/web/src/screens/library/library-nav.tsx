// The Library's own navigation, beside the main column: Continue, then the workspace's projects.
import { LIBRARY_WORDS, Row, VirtualRows } from "@manent/ui";
import type { ReactNode } from "react";
import type { ProjectItem } from "../../services/ports.ts";
import { ShellRegion } from "../../shell/regions.tsx";
import { KindIcon } from "./project-kind.tsx";

const placeRow = (project: ProjectItem | undefined): ReactNode =>
  project === undefined ? null : (
    <Row leading={<KindIcon kind={project.kind} />}>{project.title}</Row>
  );

/**
 * The projects' names, under Continue, the place the main column shows. A window too narrow for it and the main
 * column side by side has no room for it.
 */
export function LibraryNav(props: {
  projects: readonly ProjectItem[];
}): ReactNode {
  const { projects } = props;
  return (
    <ShellRegion
      region="left_panel"
      className="hidden w-panel-left shrink-0 flex-col border-e border-line pt-2 @3xl:flex"
    >
      <Row current>{LIBRARY_WORDS.continueHeading}</Row>
      <h2 className="mn-group-label">{LIBRARY_WORDS.projectsHeading}</h2>
      <div className="min-h-0 flex-1">
        <VirtualRows
          count={projects.length}
          rowHeight="one"
          label={LIBRARY_WORDS.projectsHeading}
          renderRow={(index) => placeRow(projects[index])}
        />
      </div>
    </ShellRegion>
  );
}
