// The Flag control for a single Check row: opens the `flag_picker` people-list popover for editors/owners,
// or displays "Flagged for {Name}" once flagged. Hidden from viewers and commenters.
import type { CommentFlag, CommentThread } from "@manent/crdt";
import type { TextAnchor } from "@manent/schema";
import {
  Avatar,
  Button,
  CHECKS_WORDS,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  SHARING_WORDS,
} from "@manent/ui";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { initialsOf } from "../initials.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { fullNameOf } from "../services/sync/index-entries.ts";
import type { PersonPresent } from "../state/people.store.ts";
import { fetchFlaggablePeople, writeCheckFlag } from "./flag-write.ts";
import type { FlaggablePerson } from "./flag-write.ts";

interface KnownPerson {
  readonly userId: string;
  readonly name: string;
}

function firstNameFor(userId: string, people: readonly KnownPerson[]): string {
  const full =
    people.find((person) => person.userId === userId)?.name ??
    fullNameOf(userId);
  return full.split(" ")[0] ?? full;
}

function activeFlagFor(
  checkKey: string,
  flags: Readonly<Record<string, CommentFlag>>,
  threads: Readonly<Record<string, CommentThread>>,
): CommentFlag | null {
  for (const flag of Object.values(flags)) {
    if (flag.checkKey !== checkKey) continue;
    const thread = threads[flag.threadId];
    if (thread === undefined || thread.state.kind !== "resolved") return flag;
  }
  return null;
}

export function FlagControl(props: {
  docId: string;
  checkKey: string;
  sentence: string;
  subject: string;
  anchor: TextAnchor | null;
  canFlag: boolean;
  flags: Readonly<Record<string, CommentFlag>>;
  threads: Readonly<Record<string, CommentThread>>;
  knownPeople: readonly KnownPerson[];
  presentPeople: readonly PersonPresent[];
}): ReactNode {
  const {
    docId,
    checkKey,
    sentence,
    subject,
    anchor,
    canFlag,
    flags,
    threads,
    knownPeople,
    presentPeople,
  } = props;
  const services = useServices();
  const { now, randomId } = useEnvironment();
  const [people, setPeople] = useState<readonly FlaggablePerson[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);

  const loadPeople = useCallback((): void => {
    if (!canFlag) return;
    setLoading(true);
    void fetchFlaggablePeople(docId, services.userId).then((found) => {
      setPeople(found ?? []);
      setLoading(false);
    });
  }, [canFlag, docId, services.userId]);

  const existing = activeFlagFor(checkKey, flags, threads);
  if (existing !== null) {
    const combined: readonly KnownPerson[] =
      people === null ? knownPeople : [...people, ...knownPeople];
    return (
      <span className="shrink-0 py-0.5 text-meta text-fg-muted">
        {CHECKS_WORDS.flaggedFor(
          firstNameFor(existing.flaggedUserId, combined),
        )}
      </span>
    );
  }
  // Only editors and owners see Flag (matching the server's S2-1 A rule).
  if (!canFlag) return null;

  const colourByUserId = new Map(
    presentPeople.map((person) => [person.userId, person.colour]),
  );

  const onChoose = async (target: FlaggablePerson): Promise<void> => {
    if (writing) return;
    setWriting(true);
    try {
      await writeCheckFlag({
        docId,
        services,
        checkKey,
        sentence,
        subject,
        anchor,
        target,
        now,
        randomId,
      });
    } finally {
      setWriting(false);
    }
  };

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) loadPeople();
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={writing}
            className="shrink-0"
          />
        }
      >
        {CHECKS_WORDS.flag}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        data-surface="flag_picker"
        aria-label={CHECKS_WORDS.flagHeading}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{CHECKS_WORDS.flagHeading}</DropdownMenuLabel>
          {people !== null && people.length > 0 ? (
            people.map((person) => (
              <DropdownMenuItem
                key={person.userId}
                className="min-h-row-2 text-ui"
                onClick={() => void onChoose(person)}
              >
                <Avatar
                  name={person.name}
                  initials={initialsOf(person.name)}
                  colour={colourByUserId.get(person.userId) ?? null}
                  size="md"
                  decorative
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{person.name}</span>
                  <span className="truncate text-meta text-fg-muted">
                    {SHARING_WORDS.roles[person.role]}
                  </span>
                </span>
              </DropdownMenuItem>
            ))
          ) : loading ? null : (
            <p className="px-2 py-1 text-ui text-fg-muted">
              {CHECKS_WORDS.flagEmpty}
            </p>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
