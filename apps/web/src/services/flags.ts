// A person's one-way facts, such as having seen the Tour, kept in their private index.
import type { KeyValueMap } from "@manent/settings";
import type { Flags } from "./ports.ts";

/** `index` holds `true` under each flag set; a flag is never cleared. */
export function createFlags(options: { index: KeyValueMap }): Flags {
  const { index } = options;
  return {
    has: (flag) => index.get(flag) === true,
    set(flag) {
      if (index.get(flag) !== true) index.set(flag, true);
    },
  };
}
