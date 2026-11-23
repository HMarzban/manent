// The seed driver's sharing of a script through the server's routes.
import type { SeedSharing } from "@manent/demo";
import type { Driving } from "./driving.ts";

/** Null for every server. */
export function createSharingDriver(_d: Driving): SeedSharing | null {
  return null;
}
