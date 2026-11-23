// The people in the document, at the end of the title bar: at most three avatars, then how many more, opening the people list.
import {
  AvatarStack,
  Button,
  DOCUMENT_WORDS,
  DropdownMenu,
  DropdownMenuTrigger,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useState } from "react";
import type { ReactNode } from "react";
import { PeopleList } from "../../selection/people-list.tsx";
import type { PersonPresent } from "../../state/people.store.ts";

/**
 * In a title bar too narrow for them, the avatars give way to the count of everyone. The list stays open when the
 * last person leaves, and says so; once it closes, nothing is drawn until someone arrives.
 */
export function People(props: {
  docId: string;
  people: Subscribable<readonly PersonPresent[]>;
}): ReactNode {
  const people = useSubscribable(props.people);
  const [open, setOpen] = useState(false);
  if (people.length === 0 && !open) return null;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="shrink-0 px-1" />}
      >
        {people.length === 0 ? null : (
          <>
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
          </>
        )}
      </DropdownMenuTrigger>
      <PeopleList docId={props.docId} people={people} />
    </DropdownMenu>
  );
}
