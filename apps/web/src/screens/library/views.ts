// The Library's views of a workspace, which its navigation chooses between; a feature adds its view with one line.
import type { ComponentType } from "react";
import type { ContinueItem, ProjectItem } from "../../services/ports.ts";
import { ContinueView } from "./continue-list.tsx";
import { CONTINUE_VIEW_ID } from "./library-address.ts";
import { FavouritesView } from "./favourites-view.tsx";
import { PrivateView } from "./private-view.tsx";
import { FolderView } from "./folder-tree.tsx";
import { TrashView } from "./trash-view.tsx";
import { SearchResults } from "./search-results.tsx";

/** What the Library has read of the workspace shown; `workspaceId` is null while it is not known. */
export interface LibraryViewProps {
  readonly workspaceId: string | null;
  readonly continueList: readonly ContinueItem[];
  readonly projects: readonly ProjectItem[];
  /** The workspace's list could not be loaded. */
  readonly problem: boolean;
}

export interface LibraryView {
  readonly id: string;
  /**
   * `view`: shown while the address's `view` is the entry's id; the first entry is shown while it names none. `q`:
   * shown while the address holds a search, whatever its `view`.
   */
  readonly chosenBy: "view" | "q";
  readonly View: ComponentType<LibraryViewProps>;
}

/** The view an address that names none shows. */
export const CONTINUE_VIEW: LibraryView = {
  id: CONTINUE_VIEW_ID,
  chosenBy: "view",
  View: ContinueView,
};

export const LIBRARY_VIEWS: readonly LibraryView[] = [
  CONTINUE_VIEW,
  { id: "favourites", chosenBy: "view", View: FavouritesView },
  { id: "private", chosenBy: "view", View: PrivateView },
  { id: "folder", chosenBy: "view", View: FolderView },
  { id: "trash", chosenBy: "view", View: TrashView },
  { id: "search", chosenBy: "q", View: SearchResults },
];
