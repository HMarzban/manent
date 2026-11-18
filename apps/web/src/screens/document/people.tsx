// The people in the document, at the end of the title bar: at most three avatars, then how many more.
import { DOCUMENT_WORDS, cn, useSubscribable } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { ReactNode } from "react";
import type { PersonPresent } from "../../state/people.store.ts";

const SHOWN = 3;
// the narrow title bar's container query: the count of everyone replaces the avatars and the count of the rest
const NARROW_HIDDEN = "@max-3xl:hidden";
const COUNTS = Object.freeze({
  more: NARROW_HIDDEN,
  everyone: "hidden @max-3xl:inline",
});

function Count(props: { n: number; of: keyof typeof COUNTS }): ReactNode {
  return (
    <span
      role="img"
      aria-label={DOCUMENT_WORDS.moreAvatarsName(props.n)}
      data-count={props.of}
      className={cn("text-meta text-fg-muted", COUNTS[props.of])}
    >
      {DOCUMENT_WORDS.moreAvatars(props.n)}
    </span>
  );
}

/** In a title bar too narrow for them, the avatars give way to the count of everyone. */
export function People(props: {
  people: Subscribable<readonly PersonPresent[]>;
}): ReactNode {
  const people = useSubscribable(props.people);
  if (people.length === 0) return null;
  const shown = people.slice(0, SHOWN);
  const more = people.length - shown.length;
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      {shown.map((person) => (
        <span
          key={person.userId}
          role="img"
          aria-label={person.name}
          data-who={person.colour}
          className={cn(
            "flex size-avatar items-center justify-center rounded-full bg-(--who) text-micro text-collab-on",
            NARROW_HIDDEN,
          )}
        >
          {person.initials}
        </span>
      ))}
      {more === 0 ? null : <Count n={more} of="more" />}
      <Count n={people.length} of="everyone" />
    </div>
  );
}
