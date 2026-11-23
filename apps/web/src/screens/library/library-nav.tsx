// The Library's own navigation, beside the main column: Continue, then the workspace's projects.
import { LIBRARY_WORDS, Row, VirtualRows } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { ProjectItem } from "../../services/ports.ts";
import { ShellRegion } from "../../shell/regions.tsx";
import { KindIcon } from "./project-kind.tsx";

// a project opens on its first document, as its row in the main column does; one not on this device does not open
const placeRow = (
  project: ProjectItem | undefined,
  open: (docId: string) => void,
): ReactNode => {
  if (project === undefined) return null;
  const { firstDocId } = project;
  const opens = firstDocId !== null && project.place.kind !== "not_on_device";
  return (
    <Row
      leading={<KindIcon kind={project.kind} />}
      onActivate={opens ? () => open(firstDocId) : undefined}
    >
      {project.title}
    </Row>
  );
};

/**
 * Continue, which shows the Continue view of `workspaceId` and is current while it is shown, then the projects' names,
 * each opening its project. A window too narrow for it and the main column side by side has no room for it.
 */
export function LibraryNav(props: {
  workspaceId: string | null;
  continueShown: boolean;
  projects: readonly ProjectItem[];
}): ReactNode {
  const { workspaceId, continueShown, projects } = props;
  const navigate = useNavigate();
  const open = (docId: string) => void navigate({ href: `/s/${docId}` });
  const showContinue = () =>
    void navigate({
      href:
        workspaceId === null ? "/" : `/?w=${encodeURIComponent(workspaceId)}`,
    });
  return (
    <ShellRegion
      region="left_panel"
      className="hidden w-panel-left shrink-0 flex-col border-e border-line pt-2 @3xl:flex"
    >
      <Row current={continueShown} onActivate={showContinue}>
        {LIBRARY_WORDS.continueHeading}
      </Row>
      <h2 className="mn-group-label">{LIBRARY_WORDS.projectsHeading}</h2>
      <div className="min-h-0 flex-1">
        <VirtualRows
          count={projects.length}
          rowHeight="one"
          label={LIBRARY_WORDS.projectsHeading}
          renderRow={(index) => placeRow(projects[index], open)}
        />
      </div>
    </ShellRegion>
  );
}
