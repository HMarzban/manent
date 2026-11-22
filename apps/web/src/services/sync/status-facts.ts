// The status the interface reads, made from the sync client's facts about one document.
import type { DocStatus, LinkFacts } from "@manent/sync-client";
import type { DocRole } from "@manent/sync-protocol";
import type { StatusFacts } from "@manent/ui";

/**
 * `network`: the browser says it is online. `viewRole` and `viewLive`: the read-only view's role and liveness, null and
 * false without a view. `toReview`: the document's open review entries. `signedIn`: the person has a session, and so
 * is never told that a script is only on this device.
 */
export interface StatusInput {
  status: DocStatus;
  link: LinkFacts;
  network: boolean;
  viewRole: DocRole | null;
  viewLive: boolean;
  offlineSinceAt: number | null;
  toReview: number;
  signedIn: boolean;
  now: number;
}

function accessOf(input: StatusInput): StatusFacts["access"] {
  const { side } = input.status;
  if (side.includes("read_only")) return "too_old";
  if (!side.includes("view_only")) return "edit";
  return input.viewRole === "comment" ? "comment" : "view";
}

/** The first row that holds; Synced only while nothing waits. */
function serverOf(input: StatusInput): StatusFacts["server"] {
  const { status, link } = input;
  const { side } = status;
  if (side.includes("access_removed")) return "access_removed";
  if (side.includes("deleted")) return "deleted";
  if (link.issue === "sign_in") return "sign_in";
  if (side.includes("server_old") || link.issue === "server_old")
    return "server_old";
  if (link.issue === "too_old") return "app_old";
  const live = status.docSync === "synced" && status.synced;
  const viewed = side.includes("view_only") && input.viewLive;
  if (status.waiting === 0 && (live || viewed)) return "synced";
  return link.state === "offline" ? "unreachable" : "syncing";
}

export function toStatusFacts(input: StatusInput): StatusFacts {
  const { status, link, network } = input;
  const server = serverOf(input);
  const parked = server === "access_removed" || server === "deleted";
  return {
    access: accessOf(input),
    device: status.side.includes("not_saved") ? "failing" : "ok",
    network: network ? "online" : "offline",
    server,
    waiting: status.waiting,
    notSent: parked ? status.waiting : 0,
    offlineSinceAt:
      !network || link.state !== "online" ? input.offlineSinceAt : null,
    neverSynced: status.neverSynced && !input.signedIn,
    shell: "web",
    toReview: input.toReview,
    now: input.now,
  };
}
