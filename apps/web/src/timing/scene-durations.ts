import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";

const NO_DURATIONS = createValue<ReadonlyMap<string, string>>(new Map());

export function sceneDurations(): Subscribable<ReadonlyMap<string, string>> {
  return NO_DURATIONS;
}
