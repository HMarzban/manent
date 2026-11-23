// The seed driver's sends to a rundown's prompter through the server's routes.
import type { SeedPrompter } from "@manent/demo";
import type { Driving } from "./driving.ts";

/** Null for every server. */
export function createPrompterDriver(_d: Driving): SeedPrompter | null {
  return null;
}
