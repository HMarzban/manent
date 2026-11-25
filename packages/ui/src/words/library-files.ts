// Words for Library folders, Favourites, Private folder and Trash.
import { formatCount } from "./format.ts";

const countWord = (n: number, one: string, many: string): string =>
  n === 1 ? `1 ${one}` : `${formatCount(n)} ${many}`;

export const LIBRARY_FILES_WORDS = Object.freeze({
  continueHeading: "Continue",
  favouritesHeading: "Favourites",
  privateHeading: "Private",
  projectsHeading: "Projects",
  trashHeading: "Trash",
  /** Folder row second line: subfolders and projects counts, or "Empty". */
  folderSummary: (folders: number, projects: number): string => {
    if (folders === 0 && projects === 0) return "Empty";
    if (folders === 0) return countWord(projects, "project", "projects");
    if (projects === 0) return countWord(folders, "folder", "folders");
    return `${countWord(folders, "folder", "folders")} · ${countWord(projects, "project", "projects")}`;
  },
  /** Outer-first path for a folder heading or Move to folder choice. */
  folderPath: (names: readonly string[]): string => names.join(" › "),
  newFolder: "New folder",
  untitledFolder: "Untitled folder",
  renameFolder: "Rename",
  moveToFolder: "Move to folder",
  noFolder: "No folder",
  movedToFolder: (title: string, folder: string): string =>
    `Moved '${title}' to ${folder}.`,
  movedOutOfFolder: (title: string, folder: string): string =>
    `Moved '${title}' out of ${folder}.`,
  undo: "Undo",
  renameEmpty: (name: string): string =>
    `Couldn't rename '${name}': a folder needs a name.`,
  renameTooLong: (name: string): string =>
    `Couldn't rename '${name}': a folder name holds at most 200 characters.`,
  makeFolderRefused: "Couldn't make the folder. Try again.",
  moveRefused: (title: string): string =>
    `Couldn't move '${title}'. Try again.`,
  folderEmpty: "Move a project here with Move to folder, in its row menu.",
  favourite: "Favourite",
  removeFromFavourites: "Remove from Favourites",
  favouritesProjects: "Projects",
  favouritesScripts: "Scripts",
  favouritesEmpty:
    "Choose Favourite in a project's or a script's row menu to keep it here.",
  privateNote: "Only you can see what you start here, until you share it.",
  privateEmpty:
    "Nothing here yet. Choose New script or New project to start something only you can see.",
});
