// The Library's address of a view, a workspace and a search, as the Library's route reads it.
import { useRouterState } from "@tanstack/react-router";

/** The id of Continue, the view an address that names none shows. */
export const CONTINUE_VIEW_ID = "continue";

/** What the address holds for the Library, each null when it names none: a workspace, a view, a folder and a search. */
export interface LibraryAddress {
  workspaceId: string | null;
  view: string | null;
  folder: string | null;
  q: string | null;
}

// a value of only spaces names nothing
const named = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

export function useLibraryAddress(): LibraryAddress {
  return {
    workspaceId: useRouterState({
      select: (state) => named(state.location.search.w),
    }),
    view: useRouterState({
      select: (state) => named(state.location.search.view),
    }),
    folder: useRouterState({
      select: (state) => named(state.location.search.folder),
    }),
    q: useRouterState({ select: (state) => named(state.location.search.q) }),
  };
}

/**
 * The address that shows the view `view` (an id of `LIBRARY_VIEWS`, Continue's while it is null) of the workspace
 * `workspaceId`, the person's first while it is null, in `folder` when given, searching for `q` unless it is null or only spaces.
 */
export function libraryHref(
  to: Omit<LibraryAddress, "folder"> & { folder?: string | null },
): string {
  const search = new URLSearchParams();
  if (to.workspaceId !== null) search.set("w", to.workspaceId);
  if (to.view !== null && to.view !== CONTINUE_VIEW_ID)
    search.set("view", to.view);
  const folder = to.folder ?? null;
  if (folder !== null && folder.trim() !== "") search.set("folder", folder);
  if (to.q !== null && to.q.trim() !== "") search.set("q", to.q);
  const query = search.toString();
  return query === "" ? "/" : `/?${query}`;
}
