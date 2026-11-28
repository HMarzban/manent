// The single bridge through which product screens read demo-specific people and tour metadata.
import { DEMO_PEOPLE, TOUR, demoPersonName, isShown } from "@manent/demo";
import type { DemoPerson } from "@manent/demo";

export { demoPersonName };

const DEMO_PEOPLE_LIST: readonly {
  readonly userId: string;
  readonly name: string;
}[] = Object.freeze(DEMO_PEOPLE.map(({ userId, name }) => ({ userId, name })));

/** The matching demo person entry for `userId`, or null for any other user. */
export function demoPerson(userId: string): DemoPerson | null {
  return DEMO_PEOPLE.find((person) => person.userId === userId) ?? null;
}

/** Readonly list of demo people (userId and name) for fallback writer directories. */
export function demoPeopleList(): readonly {
  readonly userId: string;
  readonly name: string;
}[] {
  return DEMO_PEOPLE_LIST;
}

/** Whether at least one Tour scenario is visible in this build. */
export function hasVisibleTourScenarios(): boolean {
  return TOUR.scenarios.some(isShown);
}

/** The person label for window titles: demo display name, else real `personName` when distinct from `userId`. */
export function personTitleName(
  userId: string,
  personName?: string | null,
): string | null {
  return (
    demoPerson(userId)?.name ??
    (personName && personName !== userId ? personName : null)
  );
}
