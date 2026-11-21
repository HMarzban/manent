// The tiers a run measures on, the areas of the suite, and the tier that judges each area.

export const TIER_IDS = [
  "host",
  "D-modest",
  "D-typical",
  "D-small",
  "ci-shared",
] as const;
export type TierId = (typeof TIER_IDS)[number];

export const AREAS = [
  "corpus",
  "crdt",
  "client",
  "server",
  "desktop",
  "demo",
] as const;
export type Area = (typeof AREAS)[number];

/** The tier on which each area's budgets are judged. */
export const JUDGED_ON: Readonly<Record<Area, TierId>> = Object.freeze({
  corpus: "D-modest",
  crdt: "D-modest",
  client: "D-modest",
  server: "D-small",
  desktop: "host",
  demo: "host",
});
