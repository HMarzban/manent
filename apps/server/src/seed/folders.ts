// The seed driver's folders and Trash in a workspace.
import { SeedDriverError } from "@manent/demo";
import type { Driving } from "./driving.ts";

/** Rejects with SeedDriverError "unavailable": no document is put in Trash yet. */
export function trashDocument(
  _d: Driving,
  _userId: string,
  docId: string,
  _at: number,
): Promise<void> {
  return Promise.reject(
    new SeedDriverError("unavailable", `${docId} cannot be put in Trash`),
  );
}
