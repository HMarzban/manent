// What happens to one open document's words told as messages: a receipt, a rebuild, work kept aside, a refusal.
import { SETTINGS } from "@manent/settings";
import type { DocEvent, DocHandle, DocStatus } from "@manent/sync-client";
import type { RemovedDocResponse } from "@manent/sync-protocol";
import { formatDate } from "@manent/ui";
import type { TrustEvent } from "@manent/ui";

/** What an event of the handle is told as; nothing for one told later, or never. */
function eventOf(event: DocEvent): TrustEvent[] {
  switch (event.type) {
    case "receipt":
      return [
        {
          kind: "reconnected",
          synced: event.sent,
          overlaps: event.overlaps,
          unplaced: event.setAside,
        },
      ];
    case "rebuilt": {
      const { applied, overlaps, setAside } = event;
      const rebuilt: TrustEvent = { kind: "rebuilt", reapplied: applied };
      return overlaps + setAside === 0
        ? [rebuilt]
        : [
            rebuilt,
            {
              kind: "reconnected",
              synced: applied,
              overlaps,
              unplaced: setAside,
            },
          ];
    }
    case "rejected":
      return [{ kind: "changes_refused", reapplied: event.replayed }];
    case "setting_refused": {
      const def = SETTINGS.all.find((d) => d.key === event.key);
      return def === undefined
        ? []
        : [{ kind: "setting_refused", noun: def.noun ?? def.label }];
    }
    case "past_window":
    case "replaced":
    case "recovered":
    case "control":
    case "subscribed":
      return [];
  }
}

/**
 * Pushes the message of each event of `handle`, and of a removal that appears while changes wait: access removed at
 * once; a deletion once the server says who deleted it and when, asked again at each reconnect while the server cannot
 * be reached, and never told when it has no record of it. `lastSyncedAt` is when this device last synced the script.
 * Returns the function that stops listening.
 */
export function trustEventsOf(options: {
  handle: DocHandle;
  title: () => string;
  removedInfo: (docId: string) => Promise<RemovedDocResponse | null>;
  lastSyncedAt: () => Promise<number | null>;
  push: (event: TrustEvent) => void;
}): () => void {
  const { handle, push } = options;
  let stopped = false;
  let told = new Set<DocStatus["side"][number]>();
  let link = handle.status.get().link;
  let askAgain = false;

  const askWhoDeleted = (notSent: number): void => {
    askAgain = false;
    options.removedInfo(handle.docId).then(
      (info) => {
        if (info === null || stopped) return;
        push({
          kind: "deleted_while_offline",
          title: options.title(),
          byName: info.deletedByName,
          on: formatDate(info.deletedAt),
          notSent,
        });
      },
      () => {
        // the server could not be reached: the next reconnect asks again
        askAgain = true;
      },
    );
  };
  const follow = (status: DocStatus): void => {
    const appeared = status.side.filter((side) => !told.has(side));
    told = new Set(status.side);
    const reconnected = status.link === "online" && link !== "online";
    link = status.link;
    if (status.waiting === 0) return;
    if (appeared.includes("access_removed"))
      push({
        kind: "access_removed",
        title: options.title(),
        notSent: status.waiting,
      });
    const deleted = status.side.includes("deleted");
    if (appeared.includes("deleted") || (reconnected && askAgain && deleted))
      askWhoDeleted(status.waiting);
  };
  const hear = (event: DocEvent): void => {
    if (event.type === "past_window")
      void options.lastSyncedAt().then((at) => {
        if (!stopped)
          push({
            kind: "old_offline_work",
            before: at === null ? null : formatDate(at),
          });
      });
    for (const message of eventOf(event)) push(message);
  };

  follow(handle.status.get());
  const stops = [handle.status.subscribe(follow), handle.on(hear)];
  return () => {
    stopped = true;
    for (const stop of stops) stop();
  };
}
