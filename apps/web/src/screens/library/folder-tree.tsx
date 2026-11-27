// The Library's left-column folder tree, draggable project rows, drop-to-root strip and New folder control.
import {
  Button,
  CommandButton,
  LIBRARY_FILES_WORDS,
  Row,
  formatCount,
  useSubscribable,
} from "@manent/ui";
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { InlineFolderName } from "../../library/row-items.ts";
import type { ProjectItem } from "../../services/ports.ts";
import {
  childFoldersOf,
  folderAncestorIds,
} from "../../services/sync/folders.ts";
import type { FolderEntry } from "../../services/sync/folders.ts";
import {
  activeProjectDrag,
  useFolderDropTarget,
  useProjectDrag,
} from "./folder-dnd.ts";
import {
  FolderView,
  folderEntries,
  projectEntries,
  useWorkspaceFolders,
} from "./folder-view.tsx";
import { KindIcon } from "./project-kind.tsx";
import { WithRowMenu } from "./row-place.tsx";

export { FolderView };

const indent = (depth: number) =>
  depth > 0 ? { paddingInlineStart: `${depth * 0.875}rem` } : undefined;

const DISCLOSURE_SPACER = (
  <span aria-hidden="true" className="-ms-1 inline-block size-4 shrink-0" />
);

interface BranchContext {
  readonly workspaceId: string;
  readonly folders: readonly FolderEntry[];
  readonly projectsByFolder: ReadonlyMap<string | null, readonly ProjectItem[]>;
  readonly activeFolderId: string | null;
  readonly renaming: string | null;
  readonly expanded: ReadonlySet<string>;
  onExpand(folderId: string): void;
  onToggle(folderId: string): void;
  openFolder(folderId: string): void;
  openProject(docId: string): void;
}

function SidebarProjectRow(props: {
  readonly workspaceId: string | null;
  readonly project: ProjectItem;
  readonly alignWithFolders: boolean;
  readonly depth: number;
  readonly open: (docId: string) => void;
}): ReactNode {
  const { workspaceId, project, alignWithFolders, depth, open } = props;
  const opens =
    project.firstDocId !== null && project.place.kind !== "not_on_device";
  const { draggable, isDragging, dragHandlers } = useProjectDrag({
    workspaceId,
    projectId: project.projectId,
    projectTitle: project.title,
    disabled: project.place.kind === "not_on_device",
  });
  const leading = alignWithFolders ? (
    <span className="flex items-center gap-2">
      {DISCLOSURE_SPACER}
      <KindIcon kind={project.kind} />
    </span>
  ) : (
    <KindIcon kind={project.kind} />
  );

  return (
    <div
      style={indent(depth)}
      draggable={draggable}
      data-drag-source={isDragging ? "true" : undefined}
      className="mn-drag-row"
      {...dragHandlers}
    >
      <WithRowMenu title={project.title} entries={projectEntries(project)}>
        {(menu) => (
          <Row
            leading={leading}
            onActivate={opens ? () => open(project.firstDocId!) : undefined}
            menu={menu}
            menuReveal="hover"
          >
            {project.title}
          </Row>
        )}
      </WithRowMenu>
    </div>
  );
}

function FolderBranch(props: {
  readonly folder: FolderEntry;
  readonly depth: number;
  readonly ctx: BranchContext;
}): ReactNode {
  const { folder, depth, ctx } = props;
  const children = childFoldersOf(ctx.folders, folder.id);
  const direct = ctx.projectsByFolder.get(folder.id) ?? [];
  const itemCount = children.length + direct.length;
  const isOpen = ctx.expanded.has(folder.id);
  const isRenaming = ctx.renaming === folder.id;
  const hasChildren = itemCount > 0;
  const { isOver, dropHandlers } = useFolderDropTarget({
    workspaceId: ctx.workspaceId,
    targetFolderId: folder.id,
    folders: ctx.folders,
    canAutoExpand: hasChildren && !isOpen,
    onAutoExpand: () => ctx.onExpand(folder.id),
  });
  const FolderGlyph = isOpen || isOver ? FolderOpenIcon : FolderIcon;
  const toggleButton = hasChildren ? (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={folder.name}
      aria-expanded={isOpen}
      className="size-4 cursor-pointer text-fg-muted hover:text-fg"
      onClick={(e) => {
        e.stopPropagation();
        ctx.onToggle(folder.id);
      }}
    >
      <ChevronRightIcon
        aria-hidden="true"
        data-open={isOpen ? "true" : undefined}
        className="mn-tree-chevron size-icon"
      />
    </Button>
  ) : undefined;

  return (
    <div>
      <div
        style={indent(depth)}
        data-folder-id={folder.id}
        data-drop-target={isOver ? "active" : undefined}
        {...dropHandlers}
      >
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
              menuReveal="hover"
              leadingControl={toggleButton}
              leading={
                hasChildren ? (
                  <FolderGlyph
                    aria-hidden="true"
                    className="size-icon shrink-0"
                  />
                ) : (
                  <span className="flex items-center gap-2">
                    {DISCLOSURE_SPACER}
                    <FolderGlyph
                      aria-hidden="true"
                      className="size-icon shrink-0"
                    />
                  </span>
                )
              }
              trailing={
                !isRenaming && itemCount > 0
                  ? [
                      <span className="tabular-nums">
                        {formatCount(itemCount)}
                      </span>,
                    ]
                  : []
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
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 w-px bg-line"
            style={{ insetInlineStart: `${0.875 + depth * 0.875}rem` }}
          />
          {children.map((child) => (
            <FolderBranch
              key={child.id}
              folder={child}
              depth={depth + 1}
              ctx={ctx}
            />
          ))}
          {direct.map((project) => (
            <SidebarProjectRow
              key={project.projectId}
              workspaceId={ctx.workspaceId}
              project={project}
              alignWithFolders
              depth={depth + 1}
              open={ctx.openProject}
            />
          ))}
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

/** The Library left column's folder tree, draggable loose projects, root drop strip, and New folder button. */
export function FolderTree(props: FolderTreeProps): ReactNode {
  const { workspaceId, activeFolderId, projects, open, openFolder } = props;
  const { folders, projectsByFolder, renaming } = useWorkspaceFolders(
    workspaceId,
    projects,
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const drag = useSubscribable(activeProjectDrag);
  const showRootDrop =
    drag !== null &&
    drag.workspaceId === workspaceId &&
    drag.currentFolderId !== null;
  const { isOver: rootOver, dropHandlers: rootDropHandlers } =
    useFolderDropTarget({
      workspaceId,
      targetFolderId: null,
      folders,
    });

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

  const onExpand = (id: string): void => {
    setExpanded((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
  };
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
  const alignWithFolders = topFolders.length > 0;
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
          onExpand,
          onToggle,
          openFolder,
          openProject: open,
        };

  return (
    <div
      data-tour="library:folders"
      data-ring="inset"
      className="flex min-h-0 flex-1 flex-col overflow-auto px-1.5 pb-2"
    >
      {ctx === null
        ? null
        : topFolders.map((f) => (
            <FolderBranch key={f.id} folder={f} depth={0} ctx={ctx} />
          ))}
      {looseProjects.map((project) => (
        <SidebarProjectRow
          key={project.projectId}
          workspaceId={workspaceId}
          project={project}
          alignWithFolders={alignWithFolders}
          depth={0}
          open={open}
        />
      ))}
      {showRootDrop ? (
        <div
          data-drop-root=""
          data-drop-target={rootOver ? "active" : undefined}
          aria-label={LIBRARY_FILES_WORDS.moveOutOfFolderLabel}
          className="mn-drop-root mx-1.5 mt-2 flex items-center gap-2 px-2.5 py-1.5 text-meta"
          {...rootDropHandlers}
        >
          <FolderOpenIcon aria-hidden="true" className="size-icon shrink-0" />
          <span className="truncate">
            {LIBRARY_FILES_WORDS.dropToRemoveFromFolder}
          </span>
        </div>
      ) : null}
      <div className="mt-1.5">
        <CommandButton
          id="library.newFolder"
          variant="ghost"
          size="default"
          icon={<FolderPlusIcon aria-hidden="true" className="size-icon" />}
          className="w-full cursor-pointer justify-start gap-2 px-3 font-normal text-fg-muted hover:text-fg"
        />
      </div>
    </div>
  );
}
