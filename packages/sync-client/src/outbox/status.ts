// The facts behind Saved and Synced, derived from what the client knows; never stored.
import type {
  DocStatus,
  LinkState,
  SideState,
  StoredEntry,
} from "../ports/ports.ts";
import { waitingCount } from "./plan.ts";

/**
 * `merged`: the server's step 2 has been applied. `unsavedWrites`: edits not yet
 * committed to the local store. `storeRefusing`: the local store refuses writes.
 */
export interface StatusInput {
  link: LinkState;
  subscribed: boolean;
  merged: boolean;
  entries: readonly StoredEntry[];
  unsavedWrites: number;
  storeRefusing: boolean;
  wentOfflineAt: number | null;
  neverSynced: boolean;
  recovered: number;
  side: readonly SideState[];
}

// the order side states are listed in
const SIDE_ORDER: Readonly<Record<SideState, number>> = Object.freeze({
  access_removed: 0,
  deleted: 1,
  read_only: 2,
  rejected: 3,
  not_saved: 4,
  sign_in: 5,
  server_old: 6,
  view_only: 7,
});

// planOutbox's test of an entry: an own update or a setting the server has not acknowledged
function isWaiting(entry: StoredEntry): boolean {
  return !entry.acked && (entry.kind === "set" || entry.own);
}

/**
 * Synced only when the link is online, the subscription live, the server's
 * step 2 applied and no own entry unacknowledged; saved only when the local
 * store holds every edit. `not_saved` joins the side states while the store
 * refuses.
 */
export function deriveStatus(input: StatusInput): DocStatus {
  const live = input.link === "online" && input.subscribed;
  const settled = input.merged && !input.entries.some(isWaiting);
  const docSync = !live ? "local" : settled ? "synced" : "syncing";
  const side = new Set(input.side);
  if (input.storeRefusing) side.add("not_saved");
  return {
    saved: !input.storeRefusing && input.unsavedWrites === 0,
    synced: docSync === "synced",
    waiting: waitingCount(input.entries),
    link: input.link,
    docSync,
    wentOfflineAt: input.wentOfflineAt,
    neverSynced: input.neverSynced,
    recovered: input.recovered,
    side: [...side].toSorted((a, b) => SIDE_ORDER[a] - SIDE_ORDER[b]),
  };
}
