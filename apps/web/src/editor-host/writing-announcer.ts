// What is said while writing as the caret moves and people come and go, by the person's choice of what to hear.
import type { PresentPerson } from "@manent/editor";
import { EDITOR_WORDS } from "@manent/ui";

export type AnnounceSetting =
  "elements" | "elements_pages" | "elements_pages_people";

/** The element at the caret, by its label, and the page it is on; null before the editor has said. */
export interface WritingFacts {
  readonly element: string | null;
  readonly page: string | null;
}

/** The element's label when it changed, then the page's start when it changed and the person hears pages; nothing from the first facts a script gives. */
export function announcementsFor(
  setting: AnnounceSetting,
  before: WritingFacts,
  after: WritingFacts,
): readonly string[] {
  if (before.element === null && before.page === null) return [];
  const said: string[] = [];
  if (after.element !== null && after.element !== before.element)
    said.push(after.element);
  if (
    setting !== "elements" &&
    after.page !== null &&
    after.page !== before.page
  )
    said.push(EDITOR_WORDS.pageStart(after.page));
  return said;
}

const byName = (a: PresentPerson, b: PresentPerson): number =>
  a.name.localeCompare(b.name);

const isAmong = (people: readonly PresentPerson[], person: PresentPerson) =>
  people.some((other) => other.userId === person.userId);

/** Who arrived, then who left, each by name; nothing unless the person hears people. */
export function peopleAnnouncements(
  setting: AnnounceSetting,
  before: readonly PresentPerson[],
  after: readonly PresentPerson[],
): readonly string[] {
  if (setting !== "elements_pages_people") return [];
  const arrived = after.filter((person) => !isAmong(before, person));
  const left = before.filter((person) => !isAmong(after, person));
  return [
    ...arrived.toSorted(byName).map((p) => EDITOR_WORDS.personArrived(p.name)),
    ...left.toSorted(byName).map((p) => EDITOR_WORDS.personLeft(p.name)),
  ];
}
