// The sentences of one drag: one as it starts, one each time the place it would land changes, one as it ends.
import { SORTABLE_WORDS } from "../../words/sortable.ts";
import type { EntryList, Place } from "./landing.ts";
import {
  countAt,
  entryAt,
  isSamePlace,
  landingOf,
  placeOf,
} from "./landing.ts";

/** Each method returns the sentence to say, or null when nothing changed. */
export interface Announcer {
  start(itemId: string | null): string | null;
  over(targetId: string | null): string | null;
  /** A drop on no target puts the item back. */
  end(targetId: string | null, canceled: boolean): string | null;
}

interface Drag {
  label: string;
  from: Place;
  last: Place;
}

interface AnnouncerOptions {
  /** The lists as they are now; read at each event, since a drag outlives a render. */
  lists(): readonly EntryList[];
}

export function createAnnouncer({ lists }: AnnouncerOptions): Announcer {
  let drag: Drag | null = null;
  return {
    start(itemId) {
      const now = lists();
      const from = itemId === null ? null : placeOf(now, itemId);
      const entry = from === null ? null : entryAt(now, from);
      drag =
        from === null || entry === null
          ? null
          : { label: entry.label, from, last: from };
      if (drag === null) return null;
      const count = countAt(now, drag.from, drag.from);
      return SORTABLE_WORDS.pickedUp(drag.label, drag.from.index + 1, count);
    },
    over(targetId) {
      if (drag === null || targetId === null) return null;
      const now = lists();
      const to = landingOf(now, drag.from, targetId);
      if (to === null || isSamePlace(to, drag.last)) return null;
      drag.last = to;
      const count = countAt(now, drag.from, to);
      return SORTABLE_WORDS.moved(drag.label, to.index + 1, count);
    },
    end(targetId, canceled) {
      const ended = drag;
      drag = null;
      if (ended === null) return null;
      const now = lists();
      const { label, from } = ended;
      const to =
        canceled || targetId === null ? null : landingOf(now, from, targetId);
      return to === null
        ? SORTABLE_WORDS.cancelled(
            label,
            from.index + 1,
            countAt(now, from, from),
          )
        : SORTABLE_WORDS.dropped(label, to.index + 1, countAt(now, from, to));
    },
  };
}
