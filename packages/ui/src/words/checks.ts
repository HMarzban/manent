// The words of Checks, in Details and at the top of Send: the heading and what it says when nothing needs a look.

import { formatCount } from "./format.ts";

export const CHECKS_WORDS = Object.freeze({
  /** "Checks (2)" while `n` things need a look, "Checks" when none does. */
  heading: (n: number): string =>
    n > 0 ? `Checks (${formatCount(n)})` : "Checks",
  nothing: "Nothing needs a look before you send.",
});
