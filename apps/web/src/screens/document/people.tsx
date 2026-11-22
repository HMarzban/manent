// The people in the document, at the end of the title bar: at most three avatars, then how many more.
import { AvatarStack, DOCUMENT_WORDS, useSubscribable } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { ReactNode } from "react";
import type { PersonPresent } from "../../state/people.store.ts";

/** In a title bar too narrow for them, the avatars give way to the count of everyone. */
export function People(props: {
  people: Subscribable<readonly PersonPresent[]>;
}): ReactNode {
  const people = useSubscribable(props.people);
  if (people.length === 0) return null;
  return (
    <div className="ml-auto flex shrink-0 items-center">
      {/* the narrow title bar's container query */}
      <span className="flex @max-3xl:hidden">
        <AvatarStack people={people} size="md" />
      </span>
      <span
        role="img"
        aria-label={DOCUMENT_WORDS.moreAvatarsName(people.length)}
        className="hidden text-meta text-fg-muted tabular-nums @max-3xl:inline"
      >
        {DOCUMENT_WORDS.moreAvatars(people.length)}
      </span>
    </div>
  );
}
