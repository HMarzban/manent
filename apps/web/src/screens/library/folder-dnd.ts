// Native HTML5 drag-and-drop for moving Library projects (and Continue scripts via their project) into or out of folders.
import { createValue, useCommandState, useSubscribable } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { moveProjectWithUndo } from "../../handlers/library-files.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { FolderEntry } from "../../services/sync/folders.ts";
import { useLibraryAddress } from "./library-address.ts";
import { setActiveLibraryWorkspace } from "../../library/row-items.ts";

export const PROJECT_DRAG_MIME = "application/x-manent-project";
const AUTO_EXPAND_MS = 500;

export interface DraggedProject {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly workspaceId: string;
  readonly currentFolderId: string | null;
}

const activeDrag = createValue<DraggedProject | null>(null);

/** The project currently being dragged across Library surfaces; null while idle. */
export const activeProjectDrag: Subscribable<DraggedProject | null> =
  activeDrag;

/** Starts a project drag, populating both the shared subscribable (for WebKit dragover) and DataTransfer. */
export function startProjectDrag(
  event: DragEvent<HTMLElement>,
  payload: DraggedProject,
): void {
  activeDrag.set(payload);
  event.dataTransfer.effectAllowed = "move";
  try {
    event.dataTransfer.setData(PROJECT_DRAG_MIME, JSON.stringify(payload));
  } catch {
    // synthetic drag events in test environments may omit setData
  }
}

/** Clears the active project drag state once a drag ends or drops. */
export function endProjectDrag(): void {
  activeDrag.set(null);
}

/** Reads the dragged project from the active store, falling back to DataTransfer JSON for synthetic tests. */
export function readDraggedProject(
  event: DragEvent<HTMLElement>,
): DraggedProject | null {
  const live = activeDrag.get();
  if (live !== null) return live;
  const raw = event.dataTransfer?.getData(PROJECT_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "projectId" in parsed &&
      "projectTitle" in parsed &&
      "workspaceId" in parsed &&
      typeof parsed.projectId === "string" &&
      typeof parsed.projectTitle === "string" &&
      typeof parsed.workspaceId === "string"
    ) {
      const currentFolderId =
        "currentFolderId" in parsed &&
        typeof parsed.currentFolderId === "string"
          ? parsed.currentFolderId
          : null;
      return {
        projectId: parsed.projectId,
        projectTitle: parsed.projectTitle,
        workspaceId: parsed.workspaceId,
        currentFolderId,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/** True when `drag` belongs to `workspaceId` and moving it to `targetFolderId` actually changes its folder. */
export function canDropOnFolder(
  drag: DraggedProject | null,
  workspaceId: string | null,
  targetFolderId: string | null,
): boolean {
  return (
    drag !== null &&
    workspaceId !== null &&
    drag.workspaceId === workspaceId &&
    drag.currentFolderId !== targetFolderId
  );
}

const EMPTY_MAP: Subscribable<ReadonlyMap<string, string | null>> = createValue(
  new Map(),
);

/** Resolves drag props for any Library project row; disabled in Private view or read-only workspaces. */
export function useProjectDrag(options: {
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly projectTitle: string;
  readonly disabled?: boolean;
}): {
  readonly draggable: boolean;
  readonly isDragging: boolean;
  readonly dragHandlers: {
    readonly onDragStart: (event: DragEvent<HTMLElement>) => void;
    readonly onDragEnd: () => void;
  };
} {
  const { workspaceId, projectId, projectTitle, disabled = false } = options;
  const { folders } = useServices();
  const inPrivateView = useLibraryAddress().view === "private";
  const canMove = useCommandState("library.moveToFolder").enabled;
  const mapSource = useMemo(
    () =>
      workspaceId === null ? EMPTY_MAP : folders.projectFolders(workspaceId),
    [folders, workspaceId],
  );
  const projectFolders = useSubscribable(mapSource);
  const drag = useSubscribable(activeProjectDrag);

  const draggable =
    !disabled &&
    !inPrivateView &&
    canMove &&
    workspaceId !== null &&
    projectId !== null;
  const isDragging = projectId !== null && drag?.projectId === projectId;
  const currentFolderId =
    projectId === null ? null : (projectFolders.get(projectId) ?? null);

  return {
    draggable,
    isDragging,
    dragHandlers: {
      onDragStart(event) {
        if (!draggable || workspaceId === null || projectId === null) {
          event.preventDefault();
          return;
        }
        startProjectDrag(event, {
          projectId,
          projectTitle,
          workspaceId,
          currentFolderId,
        });
      },
      onDragEnd() {
        endProjectDrag();
      },
    },
  };
}

/** Drop-target props for a folder row or root drop zone, with 500 ms auto-expand for collapsed folders. */
export function useFolderDropTarget(options: {
  readonly workspaceId: string | null;
  readonly targetFolderId: string | null;
  readonly folders: readonly FolderEntry[];
  readonly canAutoExpand?: boolean;
  readonly onAutoExpand?: () => void;
}): {
  readonly isOver: boolean;
  readonly dropHandlers: {
    readonly onDragOver: (event: DragEvent<HTMLElement>) => void;
    readonly onDragLeave: (event: DragEvent<HTMLElement>) => void;
    readonly onDrop: (event: DragEvent<HTMLElement>) => void;
  };
} {
  const {
    workspaceId,
    targetFolderId,
    folders,
    canAutoExpand = false,
    onAutoExpand,
  } = options;
  const services = useServices();
  const { schedule } = useEnvironment();
  const canMove = useCommandState("library.moveToFolder").enabled;
  const active = useSubscribable(activeProjectDrag);
  const [isOver, setIsOver] = useState(false);
  const cancelExpand = useRef<(() => void) | null>(null);

  const clearExpand = (): void => {
    cancelExpand.current?.();
    cancelExpand.current = null;
  };

  useEffect(() => {
    if (active === null) {
      setIsOver(false);
      clearExpand();
    }
  }, [active]);

  useEffect(() => () => clearExpand(), []);

  return {
    isOver,
    dropHandlers: {
      onDragOver(event) {
        if (!canMove) return;
        const drag = readDraggedProject(event);
        if (!canDropOnFolder(drag, workspaceId, targetFolderId)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        setIsOver(true);
        if (
          canAutoExpand &&
          onAutoExpand !== undefined &&
          cancelExpand.current === null
        ) {
          cancelExpand.current = schedule(() => {
            cancelExpand.current = null;
            onAutoExpand();
          }, AUTO_EXPAND_MS);
        }
      },
      onDragLeave(event) {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        setIsOver(false);
        clearExpand();
      },
      onDrop(event) {
        setIsOver(false);
        clearExpand();
        if (!canMove || workspaceId === null) return;
        const drag = readDraggedProject(event);
        if (
          !canDropOnFolder(drag, workspaceId, targetFolderId) ||
          drag === null
        )
          return;
        event.preventDefault();
        endProjectDrag();
        void moveProjectWithUndo({
          services,
          workspaceId,
          projectId: drag.projectId,
          projectTitle: drag.projectTitle,
          targetFolderId,
          folders,
        });
      },
    },
  };
}

/** Shared active workspace hook for main-column rows that may lack `?w=` in the URL. */
export function useActiveDragWorkspace(): string | null {
  const { userId } = useServices();
  const addressWorkspace = useLibraryAddress().workspaceId;
  return addressWorkspace ?? activeLibraryWorkspaceSnapshot() ?? userId;
}

let lastActiveWorkspace: string | null = null;

/** Records the workspace shown by LibraryNav for drag-and-drop alongside row menus. */
export function recordActiveDragWorkspace(workspaceId: string | null): void {
  lastActiveWorkspace = workspaceId;
  setActiveLibraryWorkspace(workspaceId);
}

function activeLibraryWorkspaceSnapshot(): string | null {
  return lastActiveWorkspace;
}
