// Handlers for Library folders, Favourites and Trash, plus shared folder and Trash actions.
import type { CommandHandlers } from "@manent/commands";
import { LIBRARY_FILES_WORDS, LIBRARY_WORDS } from "@manent/ui";
import type { PersonServices } from "../services/ports.ts";
import {
  folderPathNames,
  startRenameFolder,
} from "../services/sync/folders.ts";
import type { FolderEntry } from "../services/sync/folders.ts";
import { trashActions } from "../state/trash.store.ts";
import type { HandlerDeps, Navigation } from "./index.ts";
import { shownWorkspace } from "./shown-workspace.ts";

type LibraryFilesCommandId =
  | "library.newFolder"
  | "library.renameFolder"
  | "library.moveToFolder"
  | "library.favourite"
  | "doc.moveToTrash"
  | "library.restore";

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

const firstNameOf = (name: string): string => name.split(" ")[0] ?? name;

/** Executes POST /api/trash/move, updates Trash state and announces success or refusal. */
export async function executeMoveToTrash(options: {
  readonly services: PersonServices;
  readonly navigate: (href: string) => void;
  readonly docId: string;
  readonly title: string;
  readonly workspaceId: string | null;
  readonly navigateToLibrary: boolean;
  readonly fromDialog: boolean;
}): Promise<boolean> {
  const {
    services,
    navigate,
    docId,
    title,
    workspaceId,
    navigateToLibrary,
    fromDialog,
  } = options;
  if (fromDialog) trashActions.setConfirmBusy(true);
  const result = await services.trash.move(docId);
  if (!result.ok) {
    let text = LIBRARY_FILES_WORDS.moveToTrashRefused(title);
    if (result.reason === "forbidden") {
      trashActions.set(docId, { canDelete: false });
      const wsName =
        workspaceId === null
          ? null
          : await services.trash.workspaceName(workspaceId);
      if (wsName !== null)
        text = LIBRARY_FILES_WORDS.moveToTrashNoPermission(title, wsName);
    }
    if (fromDialog) trashActions.setConfirmRefusal(text);
    else
      services.messages.push({
        id: "trash_move_refused",
        text,
        actions: [],
        lifetime: "brief",
        ownWork: false,
      });
    return false;
  }
  if (fromDialog) trashActions.closeConfirm();
  trashActions.set(docId, { inTrash: true });
  trashActions.rememberTrashed({ docId, title });
  trashActions.bumpRevision();
  services.messages.push({
    id: `trash_moved:${docId}`,
    text: LIBRARY_FILES_WORDS.movedToTrash(title),
    actions: [
      { label: LIBRARY_FILES_WORDS.restore, commandId: "library.restore" },
    ],
    lifetime: "reverse",
    ownWork: false,
  });
  if (navigateToLibrary) navigate("/");
  return true;
}

/**
 * Starts Move to Trash for `docId`: asks via the consequence dialog when anyone else holds a role on the script,
 * otherwise moves at once and announces a Restore message.
 */
export async function requestMoveToTrash(options: {
  readonly services: PersonServices;
  readonly navigate: (href: string) => void;
  readonly docId: string;
  readonly title: string;
  readonly workspaceId: string | null;
  readonly navigateToLibrary: boolean;
}): Promise<void> {
  const { services, navigate, docId, title, workspaceId, navigateToLibrary } =
    options;
  const people = await services.trash.people(docId);
  const others =
    people === null
      ? []
      : people
          .filter((person) => person.userId !== services.userId)
          .map((person) => firstNameOf(person.name));
  if (others.length > 0) {
    trashActions.openConfirm({
      docId,
      title,
      workspaceId,
      otherNames: others,
      navigateToLibrary,
    });
    return;
  }
  await executeMoveToTrash({
    services,
    navigate,
    docId,
    title,
    workspaceId,
    navigateToLibrary,
    fromDialog: false,
  });
}

/** Restores `docId` from Trash, announces `S4-LB-58`, and refreshes Trash state. */
export async function restoreTrashedDocument(options: {
  readonly services: PersonServices;
  readonly docId: string;
  readonly title: string;
  readonly reportInline?: boolean;
}): Promise<boolean> {
  const { services, docId, title, reportInline = false } = options;
  const ok = await services.trash.restore(docId);
  if (!ok) {
    if (!reportInline)
      services.messages.push({
        id: "trash_restore_refused",
        text: LIBRARY_FILES_WORDS.restoreRefused(title),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      });
    return false;
  }
  trashActions.set(docId, { inTrash: false });
  trashActions.bumpRevision();
  services.messages.dismiss(`trash_moved:${docId}`);
  services.messages.dismiss(`trash_other_moved:${docId}`);
  services.messages.push({
    id: `trash_restored:${docId}`,
    text: LIBRARY_FILES_WORDS.restoredFromTrash(title),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  });
  return true;
}

function navigateTo(router: Navigation): (href: string) => void {
  return (href) => router.navigate(href);
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
    "doc.moveToTrash"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      const title =
        services.library.documentTitle(docId).get() ??
        LIBRARY_WORDS.untitledScript;
      void (async () => {
        const workspaceId = await shownWorkspace(deps);
        await requestMoveToTrash({
          services,
          navigate: navigateTo(router),
          docId,
          title,
          workspaceId,
          navigateToLibrary: true,
        });
      })();
    },
    "library.restore"() {
      const target = trashActions.lastTrashed();
      if (target === null) return;
      void restoreTrashedDocument({
        services,
        docId: target.docId,
        title: target.title,
      });
    },
  };
}
