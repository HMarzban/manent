// The Library's own navigation, beside the main column: Continue, Favourites and Private, the workspace's projects,
// then Trash.
import { LIBRARY_WORDS, Row, VirtualRows } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { ProjectItem } from "../../services/ports.ts";
import { ShellRegion } from "../../shell/regions.tsx";
import { CONTINUE_VIEW_ID, libraryHref } from "./library-address.ts";
import { KindIcon } from "./project-kind.tsx";

// the views the side list shows above the projects, and below them, each an id of LIBRARY_VIEWS
const VIEWS_ABOVE = [
  { view: CONTINUE_VIEW_ID, label: LIBRARY_WORDS.continueHeading },
  { view: "favourites", label: LIBRARY_WORDS.favouritesHeading },
  { view: "private", label: LIBRARY_WORDS.privateHeading },
] as const;
const VIEWS_BELOW = [
  { view: "trash", label: LIBRARY_WORDS.trashHeading },
] as const;

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
 * The views of `workspaceId` it names, the one shown (`current`, an id of LIBRARY_VIEWS) marked current, and the
 * projects' names, each opening its project. A window too narrow for it and the main column side by side has no room
 * for it.
 */
export function LibraryNav(props: {
  workspaceId: string | null;
  current: string;
  projects: readonly ProjectItem[];
}): ReactNode {
  const { workspaceId, current, projects } = props;
  const navigate = useNavigate();
  const open = (docId: string) => void navigate({ href: `/s/${docId}` });
  const viewRows = (
    views: readonly { view: string; label: string }[],
  ): ReactNode => (
    // the window's edge would cut a ring drawn outside the row, so it is drawn inside, as the projects' rows are
    <div data-ring="inset">
      {views.map(({ view, label }) => (
        <Row
          key={view}
          current={view === current}
          onActivate={() =>
            void navigate({ href: libraryHref({ workspaceId, view, q: null }) })
          }
        >
          {label}
        </Row>
      ))}
    </div>
  );
  return (
    <ShellRegion
      region="left_panel"
      className="hidden w-panel-left shrink-0 flex-col border-e border-line pt-2 @3xl:flex"
    >
      {viewRows(VIEWS_ABOVE)}
      <h2 className="mn-group-label">{LIBRARY_WORDS.projectsHeading}</h2>
      <div className="min-h-0 flex-1">
        <VirtualRows
          count={projects.length}
          rowHeight="one"
          label={LIBRARY_WORDS.projectsHeading}
          renderRow={(index) => placeRow(projects[index], open)}
        />
      </div>
      <div className="shrink-0 pb-2">{viewRows(VIEWS_BELOW)}</div>
    </ShellRegion>
  );
}
