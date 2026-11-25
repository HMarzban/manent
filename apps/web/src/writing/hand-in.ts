// Which script's Hand in view the History tab shows, and the hand-ins the message slot's actions reach.
import { createValue } from "@manent/ui";

/** Null while none is shown. */
export const handInShown = createValue<string | null>(null);

/** By room docId: the "Before hand-in" version of the person's own last hand-in in this tab. */
export const handedInVersions = new Map<string, string>();

/** By room docId: the last hand-in someone else made while the script was open here; `at` in milliseconds since the epoch. */
export const othersHandIns = new Map<
  string,
  { versionId: string; at: number }
>();
