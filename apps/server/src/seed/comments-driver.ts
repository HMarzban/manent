// The seed driver's comments: threads and their comments through the server's routes.
import type { SeedComments } from "@manent/demo";
import type { Driving } from "./driving.ts";

/** Null for every server. */
export function createCommentsDriver(_d: Driving): SeedComments | null {
  return null;
}
