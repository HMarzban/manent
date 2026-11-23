// The seed driver's rundowns: each rundown and its stories.
import type { SeedRundowns } from "@manent/demo";
import type { Driving } from "./driving.ts";

/** Null for every server. */
export function createRundownsDriver(_d: Driving): SeedRundowns | null {
  return null;
}
