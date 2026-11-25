// The Library's `?view=` ids, which the router validates in the entry; the views themselves load with the Library.
import { CONTINUE_VIEW_ID } from "./library-address.ts";

/** The ids accepted by `?view=`, in the order the Library lists them. */
export const LIBRARY_VIEW_IDS = [
  CONTINUE_VIEW_ID,
  "favourites",
  "private",
  "folder",
  "trash",
] as const;
export type LibraryViewId = (typeof LIBRARY_VIEW_IDS)[number];

export function isLibraryViewId(value: unknown): value is LibraryViewId {
  return LIBRARY_VIEW_IDS.some((id) => id === value);
}
