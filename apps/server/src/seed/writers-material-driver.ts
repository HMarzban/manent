// The seed driver's writers' material: a script's alternates and cuts.
import type { SeedWritersMaterial } from "@manent/demo";
import type { Driving } from "./driving.ts";

/** Null for every server. */
export function createWritersMaterialDriver(
  _d: Driving,
): SeedWritersMaterial | null {
  return null;
}
