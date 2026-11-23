// The seed driver's scripts started from another document.
import type { SeedStartFrom } from "@manent/demo";
import type { Driving } from "./driving.ts";

/** Null for every server. */
export function createStartFromDriver(_d: Driving): SeedStartFrom | null {
  return null;
}
