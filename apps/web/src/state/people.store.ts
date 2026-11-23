// The people present in the open document: written by the bridge, published through the throttle.

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

/** The people in the nearest `PeopleContext`; the same list while nobody arrives, leaves or changes. */
export function usePeople(): readonly PersonPresent[] {
  const people = useContext(PeopleContext);
  if (people === null)
    throw new Error("usePeople is used outside a PeopleContext");
  return useSyncExternalStore(people.subscribe, people.get, people.get);
}
