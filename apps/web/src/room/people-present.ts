// The people present in each document besides this person, as the margin-people plugin tells them.
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { PersonPresent } from "../state/people.store.ts";

interface Entry {
  readonly value: ReturnType<typeof createValue<readonly PersonPresent[]>>;
  readonly view: Subscribable<readonly PersonPresent[]>;
  subscribers: number;
}

const documents = new Map<string, Entry>();

function prune(docId: string, entry: Entry): void {
  if (entry.subscribers === 0 && entry.value.get().length === 0)
    documents.delete(docId);
}

function entryOf(docId: string): Entry {
  const known = documents.get(docId);
  if (known !== undefined) return known;
  const value = createValue<readonly PersonPresent[]>([]);
  const entry: Entry = {
    value,
    subscribers: 0,
    view: {
      get: () => value.get(),
      subscribe(listener) {
        entry.subscribers += 1;
        const stop = value.subscribe(listener);
        return () => {
          stop();
          entry.subscribers -= 1;
          prune(docId, entry);
        };
      },
    },
  };
  documents.set(docId, entry);
  return entry;
}

/** The people present in `docId`, by name; empty while no page of it is open or its presence is not live. */
export function peoplePresent(
  docId: string,
): Subscribable<readonly PersonPresent[]> {
  return entryOf(docId).view;
}

/** For the margin-people plugin only: the people now present in `docId`. */
export function showPeoplePresent(
  docId: string,
  people: readonly PersonPresent[],
): void {
  if (people.length === 0) {
    const known = documents.get(docId);
    if (known === undefined) return;
    known.value.set(people);
    prune(docId, known);
    return;
  }
  entryOf(docId).value.set(people);
}
