// The Library's own navigation, beside the main column: Continue, Favourites, Private, PROJECTS (folders & projects),
// then Trash.
import { LIBRARY_FILES_WORDS, Row } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { setActiveLibraryWorkspace } from "../../library/row-items.ts";
import type { ProjectItem } from "../../services/ports.ts";
import { ShellRegion } from "../../shell/regions.tsx";
import { FolderTree } from "./folder-tree.tsx";
import {
  CONTINUE_VIEW_ID,
  libraryHref,
  useLibraryAddress,
} from "./library-address.ts";

interface NavEntry {
  readonly view: string;
  readonly label: string;
  readonly tour?: string;
}

const VIEWS_ABOVE: readonly NavEntry[] = [
  { view: CONTINUE_VIEW_ID, label: LIBRARY_FILES_WORDS.continueHeading },
  {
    view: "favourites",
    label: LIBRARY_FILES_WORDS.favouritesHeading,
    tour: "library:favourites",
  },
  { view: "private", label: LIBRARY_FILES_WORDS.privateHeading },
];

const VIEWS_BELOW: readonly NavEntry[] = [
  {
    view: "trash",
    label: LIBRARY_FILES_WORDS.trashHeading,
    tour: "library:trash",
  },
];

/**
 * The views of `workspaceId` it names, the one shown (`current`, an id of LIBRARY_VIEWS) marked current, and the
 * workspace's folders and projects. A window too narrow for it and the main column side by side has no room for it.
 */
export function LibraryNav(props: {
  workspaceId: string | null;
  current: string;
  projects: readonly ProjectItem[];
}): ReactNode {
  const { workspaceId, current, projects } = props;
  const navigate = useNavigate();
  const address = useLibraryAddress();
  const activeFolderId = current === "folder" ? address.folder : null;

  useEffect(() => {
    setActiveLibraryWorkspace(workspaceId);
    return () => setActiveLibraryWorkspace(null);
  }, [workspaceId]);

  const open = (docId: string): void => {
    void navigate({ href: `/s/${docId}` });
  };
  const openFolder = (folderId: string): void => {
    void navigate({
      href: libraryHref({
        workspaceId,
        view: "folder",
        folder: folderId,
        q: null,
      }),
    });
  };
  const viewRows = (views: readonly NavEntry[]): ReactNode => (
    // the window's edge would cut a ring drawn outside the row, so it is drawn inside, as the projects' rows are
    <div data-ring="inset">
      {views.map(({ view, label, tour }) => (
        <div key={view} data-tour={tour}>
          <Row
            current={view === current}
            onActivate={() =>
              void navigate({
                href: libraryHref({
                  workspaceId,
                  view,
                  folder: null,
                  q: null,
                }),
              })
            }
          >
            {label}
          </Row>
        </div>
      ))}
    </div>
  );
  return (
    <ShellRegion
      region="left_panel"
      className="hidden w-panel-left shrink-0 flex-col border-e border-line pt-2 @3xl:flex"
    >
      {viewRows(VIEWS_ABOVE)}
      <h2 className="mn-group-label">{LIBRARY_FILES_WORDS.projectsHeading}</h2>
      <FolderTree
        workspaceId={workspaceId}
        activeFolderId={activeFolderId}
        projects={projects}
        open={open}
        openFolder={openFolder}
      />
      <div className="shrink-0 border-t border-line py-2">
        {viewRows(VIEWS_BELOW)}
      </div>
    </ShellRegion>
  );
}
