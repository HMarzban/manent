// Heavy's rundowns, kept out of HEAVY_DOCS, whose every document the studio writes script text into: Good Evening,
// Lannick's for each show day, and Lannick Today's 13:00 and 18:30 editions of each day.
import { seedDocId } from "@manent/sync-protocol";
import type { SeedDoc } from "./catalogue.ts";

/** `day` for the seed's day, else `day-minus-<n>` or `day-plus-<n>`. */
const dayName = (offset: number): string =>
  offset === 0
    ? "day"
    : `day-${offset < 0 ? "minus" : "plus"}-${Math.abs(offset)}`;

/** The offsets from `first` to `last`, both included. */
const days = (first: number, last: number): number[] =>
  Array.from({ length: last - first + 1 }, (_, i) => first + i);

const rundown = (projectKey: string, name: string, title: string): SeedDoc => {
  const key = `${projectKey}/rundowns/${name}`;
  return {
    key,
    projectKey,
    title,
    kind: "rundown",
    format: "variety",
    docId: seedDocId(key),
    hero: false,
  };
};

export const HEAVY_RUNDOWNS: readonly SeedDoc[] = Object.freeze([
  ...days(-9, 4).map((offset) =>
    rundown("heavy/h30", dayName(offset), "Good Evening, Lannick"),
  ),
  ...days(-7, 7).flatMap((offset) =>
    ["1300", "1830"].map((edition) =>
      rundown("heavy/h31", `${dayName(offset)}-${edition}`, "Lannick Today"),
    ),
  ),
]);
