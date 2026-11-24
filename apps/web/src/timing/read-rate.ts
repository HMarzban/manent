// The read rate in characters per second for a script; defaults until project settings supplies a per-project rate.
import { DEFAULT_READ_RATE } from "@manent/pagination";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";

const DEFAULT_RATE: Subscribable<number> = createValue(DEFAULT_READ_RATE);

/** Characters of dialogue per second used to time `docId`. */
export function readRateOf(_docId: string): Subscribable<number> {
  return DEFAULT_RATE;
}
