// The people present in the open document, written by the bridge and published through the throttle, and when
// presence counts at all.

import type { StatusFacts, Subscribable } from "@manent/ui";
import { useContext, useSyncExternalStore } from "react";
import { PeopleContext } from "./bridge-contexts.ts";
import type { Guard } from "./guard.ts";
import { createThrottledList } from "./throttle.ts";

export interface PersonPresent {
  userId: string;
  name: string;
  initials: string;
  /** 1–10, never blue. */
  colour: number;
}

export interface PeopleSelectors {
  get(): readonly PersonPresent[];
  subscribe(listener: () => void): () => void;
}

/** The people of one document. Each publish is checked with `guard` under the name `people`. */
export function createPeopleStore(options: {
  guard: Guard;
  schedule: (fn: () => void, delayMs: number) => () => void;
  composing: () => boolean;
}): {
  writer: { publish(people: readonly PersonPresent[]): void };
  selectors: PeopleSelectors;
} {
  const people = createThrottledList<PersonPresent>({
    name: "people",
    ...options,
  });
  return {
    writer: { publish: people.publish },
    selectors: { get: people.get, subscribe: people.subscribe },
  };
}

/**
 * Presence is live only while this device is online and the server is reached: otherwise the people the connection
 * last reported may have left, and the server's timeout that would remove them is not heard.
 */
export function isPresenceLive(status: StatusFacts): boolean {
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

/** The people in the nearest `PeopleContext`; the same list while nobody arrives, leaves or changes. */
export function usePeople(): readonly PersonPresent[] {
  const people = useContext(PeopleContext);
  if (people === null)
    throw new Error("usePeople is used outside a PeopleContext");
  return useSyncExternalStore(people.subscribe, people.get, people.get);
}
