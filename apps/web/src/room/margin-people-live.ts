// Other people count as present only while presence is live: online, with the server reached.
import type { StatusFacts, Subscribable } from "@manent/ui";

/**
 * Presence is live only while this device is online and the server is reached: otherwise the people the connection
 * last reported may have left, and the server's timeout that would remove them is not heard.
 */
function isPresenceLive(status: StatusFacts): boolean {
  return (
    status.network === "online" &&
    (status.server === "synced" || status.server === "syncing")
  );
}

type ListSubscribe<T> = (listener: (list: readonly T[]) => void) => () => void;

/** `subscribe`'s lists while presence is live and an empty list while it is not, told again each time that changes. */
export function whileLive<T>(
  subscribe: ListSubscribe<T>,
  status: Subscribable<StatusFacts>,
): ListSubscribe<T> {
  return (listener) => {
    let last: readonly T[] = [];
    let live = isPresenceLive(status.get());
    const stopList = subscribe((list) => {
      last = list;
      if (live) listener(list);
    });
    const stopStatus = status.subscribe((facts) => {
      if (isPresenceLive(facts) === live) return;
      live = !live;
      listener(live ? last : []);
    });
    return () => {
      stopList();
      stopStatus();
    };
  };
}
