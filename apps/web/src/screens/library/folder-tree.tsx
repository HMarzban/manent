// The Library's folder tree for the left column and the main-column Folder view.
import {
  Button,
  CommandButton,
  LIBRARY_FILES_WORDS,
  Row,
  createValue,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronRightIcon, FolderIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { InlineFolderName } from "../../library/row-items.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { ProjectItem } from "../../services/ports.ts";
import {
  childFoldersOf,
  folderAncestorIds,
  folderPathNames,
  groupByFolder,
  renamingFolderId,
} from "../../services/sync/folders.ts";
import type { FolderEntry } from "../../services/sync/folders.ts";
import { libraryHref, useLibraryAddress } from "./library-address.ts";
import { KindIcon } from "./project-kind.tsx";
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
const indent = (depth: number) =>
  depth > 0 ? { paddingInlineStart: `${depth * 0.75}rem` } : undefined;

function useWorkspaceFolders(
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

const folderEntries = (folder: FolderEntry): ReactNode =>
  FOLDER_ITEMS.length === 0
    ? null
    : FOLDER_ITEMS.map(({ id, Item }) => (
        <Item key={id} target="folder" id={folder.id} firstDocId={null} />
      ));

const projectEntries = (project: ProjectItem): ReactNode => {
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

interface BranchContext {
  readonly workspaceId: string;
  readonly folders: readonly FolderEntry[];
  readonly projectsByFolder: ReadonlyMap<string | null, readonly ProjectItem[]>;
  readonly activeFolderId: string | null;
  readonly renaming: string | null;
  readonly expanded: ReadonlySet<string>;
  onToggle(folderId: string): void;
  openFolder(folderId: string): void;
  openProject(docId: string): void;
}

function FolderBranch(props: {
  readonly folder: FolderEntry;
  readonly depth: number;
  readonly ctx: BranchContext;
}): ReactNode {
  const { folder, depth, ctx } = props;
  const children = childFoldersOf(ctx.folders, folder.id);
  const direct = ctx.projectsByFolder.get(folder.id) ?? [];
  const isOpen = ctx.expanded.has(folder.id);
  const isRenaming = ctx.renaming === folder.id;
  const Chevron = isOpen ? ChevronDownIcon : ChevronRightIcon;
  const toggleButton =
    children.length > 0 || direct.length > 0 ? (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={folder.name}
        aria-expanded={isOpen}
        className="-ms-1 size-4"
        onClick={(e) => {
          e.stopPropagation();
          ctx.onToggle(folder.id);
        }}
      >
        <Chevron aria-hidden="true" className="size-icon" />
      </Button>
    ) : (
      <span aria-hidden="true" className="inline-block size-4 shrink-0" />
    );

  return (
    <div>
      <div style={indent(depth)}>
        <WithRowMenu
          title={folder.name}
          entries={isRenaming ? null : folderEntries(folder)}
        >
          {(menu) => (
            <Row
              current={ctx.activeFolderId === folder.id}
              onActivate={
                isRenaming ? undefined : () => ctx.openFolder(folder.id)
              }
              menu={menu}
              leading={
                <span className="flex items-center gap-1">
                  {toggleButton}
                  <FolderIcon
                    aria-hidden="true"
                    className="size-icon shrink-0"
                  />
                </span>
              }
            >
              {isRenaming ? (
                <InlineFolderName
                  workspaceId={ctx.workspaceId}
                  folder={folder}
                />
              ) : (
                folder.name
              )}
            </Row>
          )}
        </WithRowMenu>
      </div>
      {isOpen ? (
        <div>
          {children.map((child) => (
            <FolderBranch
              key={child.id}
              folder={child}
              depth={depth + 1}
              ctx={ctx}
            />
          ))}
          {direct.map((p) => {
            const opens =
              p.firstDocId !== null && p.place.kind !== "not_on_device";
            return (
              <div key={p.projectId} style={indent(depth + 1)}>
                <WithRowMenu title={p.title} entries={projectEntries(p)}>
                  {(menu) => (
                    <Row
                      leading={<KindIcon kind={p.kind} />}
                      onActivate={
                        opens ? () => ctx.openProject(p.firstDocId!) : undefined
                      }
                      menu={menu}
                    >
                      {p.title}
                    </Row>
                  )}
                </WithRowMenu>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export interface FolderTreeProps {
  readonly workspaceId: string | null;
  readonly activeFolderId: string | null;
  readonly projects: readonly ProjectItem[];
  open(docId: string): void;
  openFolder(folderId: string): void;
}

/** The Library left column's folder tree, loose projects, and New folder button. */
export function FolderTree(props: FolderTreeProps): ReactNode {
  const { workspaceId, activeFolderId, projects, open, openFolder } = props;
  const { folders, projectsByFolder, renaming } = useWorkspaceFolders(
    workspaceId,
    projects,
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const needed = [
      ...(activeFolderId === null ? [] : [activeFolderId]),
      ...folderAncestorIds(folders, activeFolderId),
      ...folderAncestorIds(folders, renaming),
    ];
    if (needed.length === 0) return;
    setExpanded((prev) =>
      needed.every((id) => prev.has(id)) ? prev : new Set([...prev, ...needed]),
    );
  }, [folders, activeFolderId, renaming]);

  const onToggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const topFolders = useMemo(() => childFoldersOf(folders, null), [folders]);
  const looseProjects = projectsByFolder.get(null) ?? [];
  const ctx: BranchContext | null =
    workspaceId === null
      ? null
      : {
          workspaceId,
          folders,
          projectsByFolder,
          activeFolderId,
          renaming,
          expanded,
          onToggle,
          openFolder,
          openProject: open,
        };

  return (
    <div
      data-tour="library:folders"
      data-ring="inset"
      className="flex min-h-0 flex-1 flex-col overflow-auto"
    >
      {ctx === null
        ? null
        : topFolders.map((f) => (
            <FolderBranch key={f.id} folder={f} depth={0} ctx={ctx} />
          ))}
      {looseProjects.map((p) => {
        const opens = p.firstDocId !== null && p.place.kind !== "not_on_device";
        return (
          <WithRowMenu
            key={p.projectId}
            title={p.title}
            entries={projectEntries(p)}
          >
            {(menu) => (
              <Row
                leading={<KindIcon kind={p.kind} />}
                onActivate={opens ? () => open(p.firstDocId!) : undefined}
                menu={menu}
              >
                {p.title}
              </Row>
            )}
          </WithRowMenu>
        );
      })}
      <div className="px-2 pt-2">
        <CommandButton id="library.newFolder" variant="ghost" size="sm" />
      </div>
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

  return (
    <section
      aria-label={heading}
      className="flex min-h-0 flex-1 flex-col gap-6"
    >
      <h2 className="text-heading">{heading}</h2>
      {empty ? (
        <p className="text-ui text-fg-muted">
          {LIBRARY_FILES_WORDS.folderEmpty}
        </p>
      ) : null}
      {subfolders.length > 0 && workspaceId !== null ? (
        <div className="mn-table shrink-0">
          {subfolders.map((sub) => {
            const subCount = childFoldersOf(folders, sub.id).length;
            const projCount = (projectsByFolder.get(sub.id) ?? []).length;
            const isRenaming = renaming === sub.id;
            return (
              <WithRowMenu
                key={sub.id}
                title={sub.name}
                entries={isRenaming ? null : folderEntries(sub)}
              >
                {(menu) => (
                  <Row
                    leading={
                      <FolderIcon aria-hidden="true" className="size-icon" />
                    }
                    meta={LIBRARY_FILES_WORDS.folderSummary(
                      subCount,
                      projCount,
                    )}
                    onActivate={
                      isRenaming ? undefined : () => openFolder(sub.id)
                    }
                    menu={menu}
                  >
                    {isRenaming ? (
                      <InlineFolderName
                        workspaceId={workspaceId}
                        folder={sub}
                      />
                    ) : (
                      <span className="font-semibold">{sub.name}</span>
                    )}
                  </Row>
                )}
              </WithRowMenu>
            );
          })}
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
