// The facts behind Saved and Synced, derived from what the client knows; never stored.
import type {
  DocStatus,
  LinkState,
  SideState,
  StoredEntry,
} from "../ports/ports.ts";
import type { UpstreamStatus } from "../upstream/status.ts";
import type { Via } from "../upstream/window.ts";
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
  /** "server" unless given. With "local_node", the link and the subscription are the window's to the node. */
  via?: Via;
  /** With `via` "local_node": the latest status the node sent of its upstream, absent before the first. */
  upstream?: UpstreamStatus;
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

/** What a window assumes of the upstream before the node's first status. */
const NO_UPSTREAM: Pick<
  UpstreamStatus,
  | "link"
  | "synced"
  | "waiting"
  | "wentOfflineAt"
  | "side"
  | "device"
  | "recovered"
> = Object.freeze({
  link: "connecting",
  synced: false,
  waiting: 0,
  wentOfflineAt: null,
  side: [],
  device: "ok",
  recovered: [],
});

// planOutbox's test of an entry: an own update or a setting the server has not acknowledged
function isWaiting(entry: StoredEntry): boolean {
  return !entry.acked && (entry.kind === "set" || entry.own);
}

function ordered(side: Iterable<SideState>): SideState[] {
  return [...side].toSorted((a, b) => SIDE_ORDER[a] - SIDE_ORDER[b]);
}

/** As the server's status, or, through the local node, as the node's and the upstream's together. */
export function deriveStatus(input: StatusInput): DocStatus {
  return input.via === "local_node" ? nodeStatus(input) : serverStatus(input);
}

/**
 * Synced only when the link is online, the subscription live, the server's
 * step 2 applied and no own entry unacknowledged; saved only when the local
 * store holds every edit. `not_saved` joins the side states while the store
 * refuses.
 */
function serverStatus(input: StatusInput): DocStatus {
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
    side: ordered(side),
  };
}

/**
 * Saved only when the node acknowledged every own entry, the store took every
 * write and the node's device is not failing; synced only when saved and the
 * upstream is synced. The link, the offline time, the never-synced state and
 * the Recovered text are the upstream's.
 */
function nodeStatus(input: StatusInput): DocStatus {
  const { neverSynced } = input;
  const upstream = input.upstream ?? { ...NO_UPSTREAM, neverSynced };
  const failing = upstream.device === "failing";
  const saved =
    !input.storeRefusing && !failing && !input.entries.some(isWaiting);
  const synced = saved && upstream.synced;
  const live = input.link === "online" && input.subscribed;
  const side = new Set([...input.side, ...upstream.side]);
  if (input.storeRefusing || failing) side.add("not_saved");
  return {
    saved,
    synced,
    waiting: waitingCount(input.entries) + upstream.waiting,
    link: upstream.link,
    docSync: synced ? "synced" : live ? "syncing" : "local",
    wentOfflineAt: upstream.wentOfflineAt,
    neverSynced: upstream.neverSynced,
    recovered: upstream.recovered.length,
    side: ordered(side),
  };
}
