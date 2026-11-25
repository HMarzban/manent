// The people in the document, at the end of the title bar: at most three avatars, then how many more, then how many
// have it open to read only, opening the people list.
import {
  AvatarStack,
  Button,
  DOCUMENT_WORDS,
  DropdownMenu,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  ViewerCount,
  joinNames,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useState } from "react";
import type { ReactNode } from "react";
import { PeopleList } from "../../selection/people-list.tsx";
import type { PersonPresent } from "../../state/people.store.ts";

const TOOLTIP_NAMES = 4;

/** Compact summary shown when hovering the closed people stack in the title bar. */
function hoverSummary(
  people: readonly PersonPresent[],
  viewers: number,
): string | null {
  const parts: string[] = [];
  if (people.length > 0) {
    const shown = people.slice(0, TOOLTIP_NAMES).map((p) => p.name);
    const rest = people.length - shown.length;
    parts.push(
      rest > 0
        ? `${joinNames(shown)}, ${DOCUMENT_WORDS.moreAvatarsName(rest)}`
        : joinNames(shown),
    );
  }
  if (viewers > 0) parts.push(DOCUMENT_WORDS.moreViewersName(viewers));
  return parts.length === 0 ? null : parts.join(" · ");
}

/**
 * In a title bar too narrow for them, the avatars give way to the count of everyone. The list stays open when the
 * last person leaves, and says so; once it closes, nothing is drawn until someone arrives.
 */
export function People(props: {
  docId: string;
  people: Subscribable<readonly PersonPresent[]>;
  viewers: Subscribable<number>;
}): ReactNode {
  const people = useSubscribable(props.people);
  const viewers = useSubscribable(props.viewers);
  const [open, setOpen] = useState(false);
  if (people.length === 0 && viewers === 0 && !open) return null;
  const summary = hoverSummary(people, viewers);
  const trigger = (
    <DropdownMenuTrigger
      render={
        <Button variant="ghost" className="shrink-0 gap-1 rounded-full px-1" />
      }
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
      <ViewerCount viewers={viewers} />
    </DropdownMenuTrigger>
  );
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip disabled={open || summary === null}>
        <TooltipTrigger render={trigger} />
        <TooltipContent className="max-w-xs data-closed:hidden">
          {summary}
        </TooltipContent>
      </Tooltip>
      <PeopleList docId={props.docId} people={people} viewers={viewers} />
    </DropdownMenu>
  );
}
