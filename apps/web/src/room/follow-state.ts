// Whom this person follows, kept on this device only, and whom they last chose to follow from the people list.
import { createValue } from "@manent/ui";

export interface Followed {
  readonly docId: string;
  readonly userId: string;
  readonly name: string;
}

/** Null while this person follows nobody; written by the follow controller only. */
export const followed = createValue<Followed | null>(null);

let chosen: { docId: string; userId: string } | null = null;

/** The person `room.follow` follows next. */
export function chooseToFollow(docId: string, userId: string): void {
  chosen = { docId, userId };
}

/** The person chosen last, once; null when nobody was chosen since. */
export function takeChosen(): { docId: string; userId: string } | null {
  const taken = chosen;
  chosen = null;
  return taken;
}
