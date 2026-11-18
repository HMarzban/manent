// The status beside a document's title: where the words are, on this device and on the server.

import { formatCount, formatDate, formatDay, formatTime } from "./format.ts";

/** Everything the status is said from. `offlineSinceAt` is null when the moment the device went offline is not known; `now` is the clock's reading. */
export interface StatusFacts {
  access: "edit" | "comment" | "view" | "too_old";
  device: "ok" | "failing";
  network: "online" | "offline";
  server:
    | "synced"
    | "syncing"
    | "unreachable"
    | "server_old"
    | "app_old"
    | "sign_in"
    | "access_removed"
    | "deleted";
  waiting: number;
  notSent: number;
  offlineSinceAt: number | null;
  neverSynced: boolean;
  shell: "web" | "desktop";
  toReview: number;
  now: number;
}

/** The two slots' words. When `spans`, `server` is one sentence across both slots and `device` is null. */
export interface StatusWords {
  device: string | null;
  server: string;
  tone: "quiet" | "normal" | "attention" | "alert";
  spans: boolean;
}

/** How long the waiting count stays at 0 before `Synced` is shown. */
export const SYNCED_AFTER_MS = 2000;

const DAY_MS = 86_400_000;
const DATE_ALONE_AFTER_MS = 6 * DAY_MS;

type ServerSlot = Pick<StatusWords, "server" | "tone">;

const spanning = (server: string, tone: StatusWords["tone"]): StatusWords => ({
  device: null,
  server,
  tone,
  spans: true,
});

/** `head`, then the count and its noun after a comma; a count of 0 is left out with its comma. */
const counted = (head: string, n: number, noun: string): string =>
  n === 0 ? head : `${head}, ${formatCount(n)} ${noun}`;

function offlineSince(at: number | null, now: number): string {
  if (at === null || now - at <= DAY_MS) return "Offline";
  if (now - at > DATE_ALONE_AFTER_MS) return `Offline since ${formatDate(at)}`;
  return `Offline since ${formatDay(at)} ${formatTime(at)}`;
}

type OnlineServer = Exclude<
  StatusFacts["server"],
  "access_removed" | "deleted"
>;

/** The server slot of a device that can save, the first matching row in precedence order. */
function serverSlot(f: StatusFacts): ServerSlot {
  if (f.neverSynced)
    return {
      server:
        f.shell === "desktop"
          ? "On this device only"
          : "Only in this browser — not backed up",
      tone: "normal",
    };
  if (f.server === "access_removed")
    return {
      server:
        f.notSent === 0
          ? "Access removed"
          : `Access removed, ${formatCount(f.notSent)} not sent`,
      tone: "attention",
    };
  if (f.server === "deleted")
    return {
      server:
        f.notSent === 0
          ? "Deleted"
          : `Deleted, ${formatCount(f.notSent)} not sent`,
      tone: "attention",
    };
  // Sign-in and the server's answers are known only online, so offline wins over them.
  if (f.network === "offline")
    return {
      server: counted(
        offlineSince(f.offlineSinceAt, f.now),
        f.waiting,
        "waiting",
      ),
      tone: "normal",
    };
  return onlineSlot(f.server, f.waiting, f.toReview);
}

function onlineSlot(
  server: OnlineServer,
  waiting: number,
  toReview: number,
): ServerSlot {
  switch (server) {
    case "sign_in":
      return {
        server: counted("Sign in to sync", waiting, "waiting"),
        tone: "normal",
      };
    case "unreachable":
      return {
        server: counted("Can't reach Manent", waiting, "waiting"),
        tone: "normal",
      };
    case "server_old":
      return {
        server: counted("Server out of date", waiting, "waiting"),
        tone: "normal",
      };
    case "app_old":
      return {
        server: counted("Update Manent to sync", waiting, "waiting"),
        tone: "normal",
      };
    case "syncing":
      return { server: "Syncing…", tone: "normal" };
    case "synced":
      return toReview === 0
        ? { server: "Synced", tone: "quiet" }
        : {
            server: counted("Synced", toReview, "to review"),
            tone: "attention",
          };
  }
}

/** The status for `facts`: the first row that matches, in the order device storage, access removed or deleted, sign-in, the server, offline. */
export function statusText(facts: StatusFacts): StatusWords {
  if (facts.access === "view") return spanning("View only", "normal");
  if (facts.access === "too_old")
    return spanning("Read-only — update Manent to edit", "normal");
  if (facts.device === "failing" && facts.network === "offline")
    return spanning("Can't save on this device — export a copy", "alert");
  const slot = serverSlot(facts);
  if (facts.device === "failing")
    return {
      device: "Not saved on this device",
      server: slot.server,
      tone: "alert",
      spans: false,
    };
  return { device: "Saved", ...slot, spans: false };
}
