// Library row-menu items for folders, favourites and Trash.
import type { ReactNode } from "react";

export function ProjectLibraryRowItems(_props: {
  target: "project" | "folder";
  id: string;
  firstDocId: string | null;
}): ReactNode {
  return null;
}

export function DocumentLibraryRowItems(_props: { docId: string }): ReactNode {
  return null;
}
