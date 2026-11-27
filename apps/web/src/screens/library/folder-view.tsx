// Shared workspace folder subscriptions and the main-column Folder view (`?view=folder&folder=<id>`).
import {
  CommandButton,
  LIBRARY_FILES_WORDS,
  Row,
  createValue,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { FolderIcon, FolderOpenIcon, FolderPlusIcon } from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { InlineFolderName } from "../../library/row-items.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { ProjectItem } from "../../services/ports.ts";
import {
  childFoldersOf,
  folderPathNames,
  groupByFolder,
  renamingFolderId,
} from "../../services/sync/folders.ts";
import type { FolderEntry } from "../../services/sync/folders.ts";
import { useFolderDropTarget } from "./folder-dnd.ts";
import { FolderEmptyHero } from "./folder-empty-hero.tsx";
import { libraryHref, useLibraryAddress } from "./library-address.ts";
import { LibraryViewHeader } from "./library-view-header.tsx";
import { ProjectList } from "./project-list.tsx";
import { PROJECT_ROW_ITEMS } from "./project-row-items.ts";
import { WithRowMenu } from "./row-place.tsx";
import type { LibraryViewProps } from "./views.ts";

const EMPTY_FOLDERS: Subscribable<readonly FolderEntry[]> = createValue([]);
const EMPTY_MAP: Subscribable<ReadonlyMap<string, string | null>> = createValue(
  new Map(),
);
const FOLDER_ITEMS = PROJECT_ROW_ITEMS.filter((i) =>
  i.targets.includes("folder"),
);
const PROJECT_ITEMS = PROJECT_ROW_ITEMS.filter((i) =>
  i.targets.includes("project"),
);

export function useWorkspaceFolders(
  workspaceId: string | null,
  projects: readonly ProjectItem[],
) {
  const { folders: service } = useServices();
  const foldersSource = useMemo(
    () => (workspaceId === null ? EMPTY_FOLDERS : service.list(workspaceId)),
    [service, workspaceId],
  );
  const mapSource = useMemo(
    () =>
      workspaceId === null ? EMPTY_MAP : service.projectFolders(workspaceId),
    [service, workspaceId],
  );
  const folders = useSubscribable(foldersSource);
  const projectFolders = useSubscribable(mapSource);
  const renaming = useSubscribable(renamingFolderId);
  const projectsByFolder = useMemo(
    () => groupByFolder(projects, projectFolders, folders),
    [projects, projectFolders, folders],
  );
  return { folders, projectsByFolder, renaming };
}

export const folderEntries = (folder: FolderEntry): ReactNode =>
  FOLDER_ITEMS.length === 0
    ? null
    : FOLDER_ITEMS.map(({ id, Item }) => (
        <Item key={id} target="folder" id={folder.id} firstDocId={null} />
      ));

export const projectEntries = (project: ProjectItem): ReactNode => {
  const { firstDocId } = project;
  if (
    PROJECT_ITEMS.length === 0 ||
    firstDocId === null ||
    project.place.kind === "not_on_device"
  )
    return null;
  return PROJECT_ITEMS.map(({ id, Item }) => (
    <Item
      key={id}
      target="project"
      id={project.projectId}
      firstDocId={firstDocId}
    />
  ));
};

function SubfolderTableRow(props: {
  readonly workspaceId: string;
  readonly sub: FolderEntry;
  readonly folders: readonly FolderEntry[];
  readonly subCount: number;
  readonly projCount: number;
  readonly isRenaming: boolean;
  readonly openFolder: (id: string) => void;
}): ReactNode {
  const {
    workspaceId,
    sub,
    folders,
    subCount,
    projCount,
    isRenaming,
    openFolder,
  } = props;
  const { isOver, dropHandlers } = useFolderDropTarget({
    workspaceId,
    targetFolderId: sub.id,
    folders,
  });
  const Icon = isOver ? FolderOpenIcon : FolderIcon;

  return (
    <div data-drop-target={isOver ? "active" : undefined} {...dropHandlers}>
      <WithRowMenu
        title={sub.name}
        entries={isRenaming ? null : folderEntries(sub)}
      >
        {(menu) => (
          <Row
            leading={<Icon aria-hidden="true" className="size-icon" />}
            meta={LIBRARY_FILES_WORDS.folderSummary(subCount, projCount)}
            onActivate={isRenaming ? undefined : () => openFolder(sub.id)}
            menu={menu}
          >
            {isRenaming ? (
              <InlineFolderName workspaceId={workspaceId} folder={sub} />
            ) : (
              <span className="font-semibold">{sub.name}</span>
            )}
          </Row>
        )}
      </WithRowMenu>
    </div>
  );
}

/** Main-column view for `?view=folder&folder=<id>`: direct subfolders first, then direct projects. */
export function FolderView(props: LibraryViewProps): ReactNode {
  const { workspaceId, projects } = props;
  const { where, now } = useEnvironment();
  const navigate = useNavigate();
  const folderId = useLibraryAddress().folder;
  const { folders, projectsByFolder, renaming } = useWorkspaceFolders(
    workspaceId,
    projects,
  );
  const heading =
    folderId === null
      ? LIBRARY_FILES_WORDS.projectsHeading
      : LIBRARY_FILES_WORDS.folderPath(folderPathNames(folders, folderId)) ||
        LIBRARY_FILES_WORDS.projectsHeading;
  const subfolders = useMemo(
    () => (folderId === null ? [] : childFoldersOf(folders, folderId)),
    [folders, folderId],
  );
  const directProjects =
    folderId === null ? [] : (projectsByFolder.get(folderId) ?? []);
  const openDoc = (docId: string): void =>
    void navigate({ href: `/s/${docId}` });
  const openFolder = (id: string): void =>
    void navigate({
      href: libraryHref({ workspaceId, view: "folder", folder: id, q: null }),
    });
  const empty = subfolders.length === 0 && directProjects.length === 0;
  const { isOver: emptyOver, dropHandlers: emptyDropHandlers } =
    useFolderDropTarget({
      workspaceId,
      targetFolderId: folderId,
      folders,
    });

  return (
    <section
      aria-label={heading}
      className="flex min-h-0 flex-1 flex-col gap-6"
    >
      <LibraryViewHeader
        icon={<FolderOpenIcon aria-hidden="true" className="size-icon" />}
        title={heading}
        subtitle={
          empty
            ? null
            : LIBRARY_FILES_WORDS.folderSummary(
                subfolders.length,
                directProjects.length,
              )
        }
        actions={
          empty ? undefined : (
            <CommandButton
              id="library.newFolder"
              variant="outline"
              size="sm"
              icon={<FolderPlusIcon aria-hidden="true" className="size-icon" />}
            />
          )
        }
      />
      {empty ? (
        <div
          data-drop-target={emptyOver ? "active" : undefined}
          className="mn-drop-zone flex min-h-0 flex-1 flex-col rounded-surface"
          {...emptyDropHandlers}
        >
          <FolderEmptyHero />
        </div>
      ) : null}
      {subfolders.length > 0 && workspaceId !== null ? (
        <div className="mn-table shrink-0">
          {subfolders.map((sub) => (
            <SubfolderTableRow
              key={sub.id}
              workspaceId={workspaceId}
              sub={sub}
              folders={folders}
              subCount={childFoldersOf(folders, sub.id).length}
              projCount={(projectsByFolder.get(sub.id) ?? []).length}
              isRenaming={renaming === sub.id}
              openFolder={openFolder}
            />
          ))}
        </div>
      ) : null}
      {directProjects.length > 0 ? (
        <ProjectList
          projects={directProjects}
          shell={where.shell}
          now={now()}
          open={openDoc}
        />
      ) : null}
    </section>
  );
}
