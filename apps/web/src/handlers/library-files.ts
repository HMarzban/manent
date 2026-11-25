// Handlers for Library folders, Favourites and Trash, plus shared folder create and move actions.
import type { CommandHandlers } from "@manent/commands";
import { LIBRARY_FILES_WORDS } from "@manent/ui";
import type { PersonServices } from "../services/ports.ts";
import {
  folderPathNames,
  startRenameFolder,
} from "../services/sync/folders.ts";
import type { FolderEntry } from "../services/sync/folders.ts";
import type { HandlerDeps } from "./index.ts";
import { shownWorkspace } from "./shown-workspace.ts";

type LibraryFilesCommandId =
  | "library.newFolder"
  | "library.renameFolder"
  | "library.moveToFolder"
  | "library.favourite";

/** Creates an untitled folder in `parentId`, starts inline rename on it, and reports refusal on failure. */
export async function createAndRenameFolder(options: {
  readonly services: PersonServices;
  readonly workspaceId: string;
  readonly parentId: string | null;
  readonly now: () => number;
  readonly newId: () => string;
}): Promise<void> {
  const { services, workspaceId, parentId, now, newId } = options;
  try {
    const created = await services.folders.create(workspaceId, {
      id: newId(),
      name: LIBRARY_FILES_WORDS.untitledFolder,
      parentId,
      userId: services.userId,
      now: now(),
    });
    startRenameFolder(created.id);
  } catch {
    services.messages.push({
      id: "folder_create_refused",
      text: LIBRARY_FILES_WORDS.makeFolderRefused,
      actions: [],
      lifetime: "brief",
      ownWork: false,
    });
  }
}

/** Moves `projectId` to `targetFolderId` (or out of its folder when null) and announces an Undo message. */
export async function moveProjectWithUndo(options: {
  readonly services: PersonServices;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly targetFolderId: string | null;
  readonly folders: readonly FolderEntry[];
}): Promise<void> {
  const {
    services,
    workspaceId,
    projectId,
    projectTitle,
    targetFolderId,
    folders,
  } = options;
  const folderName = (id: string): string =>
    LIBRARY_FILES_WORDS.folderPath(folderPathNames(folders, id)) || id;
  try {
    const { previousFolderId } = await services.folders.moveProject(
      workspaceId,
      projectId,
      targetFolderId,
    );
    if (previousFolderId === targetFolderId) return;
    const text =
      targetFolderId !== null
        ? LIBRARY_FILES_WORDS.movedToFolder(
            projectTitle,
            folderName(targetFolderId),
          )
        : LIBRARY_FILES_WORDS.movedOutOfFolder(
            projectTitle,
            previousFolderId === null
              ? LIBRARY_FILES_WORDS.noFolder
              : folderName(previousFolderId),
          );
    services.reverses.set("folder_moved", () => {
      void services.folders
        .moveProject(workspaceId, projectId, previousFolderId)
        .catch(() => {
          services.messages.push({
            id: "folder_move_refused",
            text: LIBRARY_FILES_WORDS.moveRefused(projectTitle),
            actions: [],
            lifetime: "brief",
            ownWork: false,
          });
        });
    });
    services.messages.push({
      id: "folder_moved",
      text,
      actions: [
        { label: LIBRARY_FILES_WORDS.undo, commandId: "settings.undo" },
      ],
      lifetime: "reverse",
      ownWork: false,
    });
  } catch {
    services.messages.push({
      id: "folder_move_refused",
      text: LIBRARY_FILES_WORDS.moveRefused(projectTitle),
      actions: [],
      lifetime: "brief",
      ownWork: false,
    });
  }
}

export function libraryFilesHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, LibraryFilesCommandId> {
  const { services, router, now } = deps;
  return {
    "library.newFolder"() {
      void (async () => {
        const workspaceId = await shownWorkspace(deps);
        const search = router.here().search;
        const parentId =
          search.view === "folder" &&
          typeof search.folder === "string" &&
          search.folder.trim() !== ""
            ? search.folder
            : null;
        await createAndRenameFolder({
          services,
          workspaceId,
          parentId,
          now,
          newId: () => crypto.randomUUID(),
        });
      })();
    },
    "library.renameFolder"() {
      const search = router.here().search;
      if (
        search.view === "folder" &&
        typeof search.folder === "string" &&
        search.folder.trim() !== ""
      )
        startRenameFolder(search.folder);
    },
    "library.moveToFolder"() {
      // handled per project row via Move to folder submenu in row-items.ts
    },
    "library.favourite"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      void (async () => {
        const workspaceId = await shownWorkspace(deps);
        await services.favourites.toggle(services.userId, {
          id: docId,
          kind: "document",
          workspaceId,
          now: now(),
        });
      })();
    },
  };
}
