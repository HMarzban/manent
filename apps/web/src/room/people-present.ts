// The people present in each document besides this person, as the margin-people plugin tells them.
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { PersonPresent } from "../state/people.store.ts";

type People = Subscribable<readonly PersonPresent[]> & {
  set(people: readonly PersonPresent[]): void;
};

const documents = new Map<string, People>();

function peopleOf(docId: string): People {
  const known =
    documents.get(docId) ?? createValue<readonly PersonPresent[]>([]);
  documents.set(docId, known);
  return known;
}

/** The people present in `docId`, by name; empty while no page of it is open or its presence is not live. */
export function peoplePresent(
  docId: string,
): Subscribable<readonly PersonPresent[]> {
  return peopleOf(docId);
}

/** For the margin-people plugin only: the people now present in `docId`. */
export function showPeoplePresent(
  docId: string,
  people: readonly PersonPresent[],
): void {
  peopleOf(docId).set(people);
}
