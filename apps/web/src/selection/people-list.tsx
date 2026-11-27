// The people list: who is in the document now, under what heads it, each person's row opening the actions on them.
import {
  Avatar,
  DOCUMENT_WORDS,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  SELECTION_WORDS,
} from "@manent/ui";
import type { ReactNode } from "react";
import type { PersonPresent } from "../state/people.store.ts";
import { PEOPLE_LIST_HEAD, PEOPLE_ROW_ACTIONS } from "./people-list-slots.ts";

function PersonRow(props: { docId: string; person: PersonPresent }): ReactNode {
  const { docId, person } = props;
  const face = (
    <>
      <Avatar
        name={person.name}
        initials={person.initials}
        colour={person.colour}
        size="md"
        decorative
      />
      <span className="truncate font-medium">{person.name}</span>
    </>
  );
  if (PEOPLE_ROW_ACTIONS.length === 0)
    return <DropdownMenuItem className="text-ui">{face}</DropdownMenuItem>;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="text-ui">
        {face}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {PEOPLE_ROW_ACTIONS.map((Action, index) => (
          <Action key={index} docId={docId} userId={person.userId} />
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/**
 * The open list, inside the menu its trigger opens: one row per person present, then how many have the script open to
 * read only, or the sentence that there is no one.
 */
export function PeopleList(props: {
  docId: string;
  people: readonly PersonPresent[];
  viewers: number;
}): ReactNode {
  const { docId, people, viewers } = props;
  return (
    <DropdownMenuContent
      align="end"
      data-tour="people_list"
      aria-label={SELECTION_WORDS.hereNow}
      className="min-w-52"
    >
      {PEOPLE_LIST_HEAD.length === 0 ? null : (
        <>
          <DropdownMenuGroup>
            {PEOPLE_LIST_HEAD.map((Head, index) => (
              <Head key={index} docId={docId} />
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuGroup>
        <DropdownMenuLabel>{SELECTION_WORDS.hereNow}</DropdownMenuLabel>
        <div className="max-h-[min(18rem,60dvh)] overflow-y-auto overscroll-contain">
          {people.map((person) => (
            <PersonRow key={person.userId} docId={docId} person={person} />
          ))}
        </div>
        {people.length > 0 && viewers === 0 ? null : (
          <p className="px-2 py-1 text-ui text-fg-muted">
            {viewers === 0
              ? SELECTION_WORDS.noOneElse
              : DOCUMENT_WORDS.moreViewersName(viewers)}
          </p>
        )}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );
}
