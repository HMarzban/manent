// The seed driver's private copies through the server's routes.
import type { SeedPrivateCopies } from "@manent/demo";
import type { Driving } from "./driving.ts";

/** Null for every server. */
export function createPrivateCopiesDriver(
  _d: Driving,
): SeedPrivateCopies | null {
  return null;
}
