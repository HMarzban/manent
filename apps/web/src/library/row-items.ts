// Library row-menu items for folders, Favourites and Trash, plus the inline folder name editor.
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  LIBRARY_FILES_WORDS,
  createValue,
  useCommandState,
  useSubscribable,
} from "@manent/ui";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import {
  Fragment,
  createElement,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  createAndRenameFolder,
  moveProjectWithUndo,
} from "../handlers/library-files.ts";
import { useLibraryAddress } from "../screens/library/library-address.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import {
  folderPathNames,
  startRenameFolder,
  stopRenameFolder,
  validateFolderName,
} from "../services/sync/folders.ts";
import type { FolderEntry } from "../services/sync/folders.ts";

const activeWorkspace = createValue<string | null>(null);

/** Records the workspace shown by LibraryNav so row menus resolve it even when `?w=` is absent. */
export function setActiveLibraryWorkspace(workspaceId: string | null): void {
  activeWorkspace.set(workspaceId);
}

function useResolvedWorkspaceId(): string {
  const { userId } = useServices();
  const addressWorkspace = useLibraryAddress().workspaceId;
  const active = useSubscribable(activeWorkspace);
  return addressWorkspace ?? active ?? userId;
}

function FolderRowMenuItems(props: { readonly id: string }): ReactNode {
  const services = useServices();
  const { now, randomId } = useEnvironment();
  const workspaceId = useResolvedWorkspaceId();
  const disabled = !useCommandState("library.newFolder").enabled;
  return createElement(
    Fragment,
    null,
    createElement(
      DropdownMenuItem,
      {
        disabled,
        onClick: () =>
          void createAndRenameFolder({
            services,
            workspaceId,
            parentId: props.id,
            now,
            newId: randomId,
          }),
      },
      LIBRARY_FILES_WORDS.newFolder,
    ),
    createElement(
      DropdownMenuItem,
      {
        disabled,
        onClick: () => startRenameFolder(props.id),
      },
      LIBRARY_FILES_WORDS.renameFolder,
    ),
  );
}

function checkIcon(active: boolean): ReactNode {
  return active
    ? createElement(CheckIcon, {
        "aria-hidden": "true",
        className: "ms-auto size-icon shrink-0 text-fg-accent",
      })
    : null;
}

function ProjectMenuItems(props: { readonly id: string }): ReactNode {
  const services = useServices();
  const { now } = useEnvironment();
  const workspaceId = useResolvedWorkspaceId();
  const moveState = useCommandState("library.moveToFolder");
  const foldersSource = useMemo(
    () => services.folders.list(workspaceId),
    [services.folders, workspaceId],
  );
  const projectFoldersSource = useMemo(
    () => services.folders.projectFolders(workspaceId),
    [services.folders, workspaceId],
  );
  const projectsSource = useMemo(
    () => services.library.projects(workspaceId),
    [services.library, workspaceId],
  );
  const favSource = useMemo(
    () => services.favourites.watch(services.userId, props.id),
    [services.favourites, services.userId, props.id],
  );
  const folders = useSubscribable(foldersSource);
  const projectFolders = useSubscribable(projectFoldersSource);
  const projects = useSubscribable(projectsSource);
  const isFav = useSubscribable(favSource);
  const currentFolderId = projectFolders.get(props.id) ?? null;
  const projectTitle =
    projects.find((item) => item.projectId === props.id)?.title ?? props.id;
  const sortedPaths = useMemo(
    () =>
      folders
        .map((folder) => ({
          id: folder.id,
          label: LIBRARY_FILES_WORDS.folderPath(
            folderPathNames(folders, folder.id),
          ),
        }))
        .toSorted(
          (a, b) =>
            a.label.localeCompare(b.label, undefined, {
              sensitivity: "base",
            }) || a.id.localeCompare(b.id),
        ),
    [folders],
  );
  const moveTo = (targetFolderId: string | null): void => {
    void moveProjectWithUndo({
      services,
      workspaceId,
      projectId: props.id,
      projectTitle,
      targetFolderId,
      folders,
    });
  };
  return createElement(
    Fragment,
    null,
    createElement(
      DropdownMenuSub,
      null,
      createElement(
        DropdownMenuSubTrigger,
        { disabled: !moveState.enabled },
        LIBRARY_FILES_WORDS.moveToFolder,
      ),
      createElement(
        DropdownMenuSubContent,
        null,
        createElement(
          DropdownMenuItem,
          { onClick: () => moveTo(null) },
          LIBRARY_FILES_WORDS.noFolder,
          checkIcon(currentFolderId === null),
        ),
        ...sortedPaths.map(({ id, label }) =>
          createElement(
            DropdownMenuItem,
            { key: id, onClick: () => moveTo(id) },
            label,
            checkIcon(currentFolderId === id),
          ),
        ),
      ),
    ),
    createElement(
      DropdownMenuItem,
      {
        onClick: () =>
          void services.favourites.toggle(services.userId, {
            id: props.id,
            kind: "project",
            workspaceId,
            now: now(),
          }),
      },
      isFav
        ? LIBRARY_FILES_WORDS.removeFromFavourites
        : LIBRARY_FILES_WORDS.favourite,
    ),
  );
}

export function ProjectLibraryRowItems(props: {
  target: "project" | "folder";
  id: string;
  firstDocId: string | null;
}): ReactNode {
  return props.target === "folder"
    ? createElement(FolderRowMenuItems, { id: props.id })
    : createElement(ProjectMenuItems, { id: props.id });
}

export function DocumentLibraryRowItems(props: { docId: string }): ReactNode {
  const services = useServices();
  const { now } = useEnvironment();
  const workspaceId = useResolvedWorkspaceId();
  const favSource = useMemo(
    () => services.favourites.watch(services.userId, props.docId),
    [services.favourites, services.userId, props.docId],
  );
  const isFav = useSubscribable(favSource);
  return createElement(
    DropdownMenuItem,
    {
      onClick: () =>
        void services.favourites.toggle(services.userId, {
          id: props.docId,
          kind: "document",
          workspaceId,
          now: now(),
        }),
    },
    isFav
      ? LIBRARY_FILES_WORDS.removeFromFavourites
      : LIBRARY_FILES_WORDS.favourite,
  );
}

/** In-place folder name editor with client-side validation matching the server's rules. */
export function InlineFolderName(props: {
  readonly workspaceId: string;
  readonly folder: FolderEntry;
}): ReactNode {
  const { workspaceId, folder } = props;
  const { folders } = useServices();
  const [draft, setDraft] = useState(folder.name);
  const [problem, setProblem] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = (): void => {
    if (done.current) return;
    const checked = validateFolderName(draft);
    if (!checked.ok) {
      setProblem(
        checked.reason === "empty"
          ? LIBRARY_FILES_WORDS.renameEmpty(folder.name)
          : LIBRARY_FILES_WORDS.renameTooLong(folder.name),
      );
      return;
    }
    done.current = true;
    setProblem(null);
    stopRenameFolder();
    if (checked.name !== folder.name)
      void folders.rename(workspaceId, folder.id, checked.name);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault();
      done.current = true;
      stopRenameFolder();
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  };

  return createElement(
    "div",
    {
      className: "flex min-w-0 flex-1 flex-col gap-1",
      onClick: (event: MouseEvent) => event.stopPropagation(),
    },
    createElement("input", {
      ref: inputRef,
      type: "text",
      value: draft,
      "aria-label": LIBRARY_FILES_WORDS.renameFolder,
      "aria-invalid": problem !== null ? true : undefined,
      onChange: (event: { target: { value: string } }) => {
        setDraft(event.target.value);
        if (problem !== null) setProblem(null);
      },
      onKeyDown,
      onBlur: commit,
      className:
        "h-control-sm w-full min-w-0 rounded-control border border-line-strong bg-well px-2 text-ui text-fg outline-none",
    }),
    problem === null
      ? null
      : createElement(
          "p",
          {
            role: "alert",
            className: "flex items-start gap-1 text-meta text-fg",
          },
          createElement(TriangleAlertIcon, {
            "aria-hidden": "true",
            className: "mt-0.5 size-icon shrink-0 text-attention",
          }),
          createElement("span", null, problem),
        ),
  );
}
