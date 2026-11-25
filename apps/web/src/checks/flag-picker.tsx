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
  Skeleton,
} from "@manent/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { initialsOf } from "../initials.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { PersonServices } from "../services/ports.ts";
import { fullNameOf } from "../services/sync/index-entries.ts";
import type { PersonPresent } from "../state/people.store.ts";
import { fetchFlaggablePeople, writeCheckFlag } from "./flag-write.ts";
import type { FlaggablePerson } from "./flag-write.ts";

const PLACEHOLDER_OPTIONS = 3;
const PEOPLE_CACHE_TTL_MS = 30_000;

interface CachedPeople {
  readonly at: number;
  readonly promise: Promise<readonly FlaggablePerson[] | null>;
}

const peopleCacheByServices = new WeakMap<
  PersonServices,
  Map<string, CachedPeople>
>();

/** Shares one in-flight/recent `/api/share/people` lookup across every Flag control on the same script. */
function loadSharedFlaggablePeople(
  services: PersonServices,
  docId: string,
  now: () => number,
): Promise<readonly FlaggablePerson[] | null> {
  let byDoc = peopleCacheByServices.get(services);
  if (byDoc === undefined) {
    byDoc = new Map();
    peopleCacheByServices.set(services, byDoc);
  }
  const currentNow = now();
  const cached = byDoc.get(docId);
  if (cached !== undefined && currentNow - cached.at < PEOPLE_CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = fetchFlaggablePeople(docId, services.userId)
    .then((found) => {
      if (found === null && byDoc.get(docId)?.promise === promise)
        byDoc.delete(docId);
      return found;
    })
    .catch(() => {
      if (byDoc.get(docId)?.promise === promise) byDoc.delete(docId);
      return null;
    });
  byDoc.set(docId, { at: currentNow, promise });
  return promise;
}

function FlagPickerSkeleton(): ReactNode {
  return (
    <div aria-busy="true" className="flex flex-col gap-1 p-1">
      {Array.from({ length: PLACEHOLDER_OPTIONS }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex min-h-row-2 items-center gap-2 px-2"
        >
          <Skeleton className="size-avatar shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

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
  const mounted = useRef(true);
  const loadSeq = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadPeople = useCallback((): void => {
    if (!canFlag) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    void loadSharedFlaggablePeople(services, docId, now)
      .then((found) => {
        if (!mounted.current || loadSeq.current !== seq) return;
        setPeople(found ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted.current || loadSeq.current !== seq) return;
        setPeople([]);
        setLoading(false);
      });
  }, [canFlag, docId, services, now]);

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
      if (mounted.current) setWriting(false);
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
          ) : loading ? (
            <FlagPickerSkeleton />
          ) : (
            <p className="px-2 py-1 text-ui text-fg-muted">
              {CHECKS_WORDS.flagEmpty}
            </p>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
