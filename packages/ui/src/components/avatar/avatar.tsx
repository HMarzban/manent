// A person as a circle of their initials, in their colour inside a script and a ring everywhere else; and the
// people on a document as a row of them.
import { cn } from "cn";
import { PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { DOCUMENT_WORDS } from "../../words/document.ts";

export type AvatarSize = "sm" | "md" | "lg";

const CIRCLE =
  "mn-avatar inline-flex shrink-0 items-center justify-center rounded-full";
const SIZES: Readonly<Record<AvatarSize, string>> = Object.freeze({
  sm: "size-avatar-sm text-micro",
  md: "size-avatar text-micro",
  lg: "size-avatar-lg text-title",
});
const SHOWN = 3;

interface AvatarProps {
  name: string;
  /** null draws a plus in their place: the person not yet chosen ("You"). */
  initials: string | null;
  /** The person's index in the script, 1 to 10; null outside a script or for a person without one. */
  colour: number | null;
  size: AvatarSize;
  /** Inside a control already named by the person, the avatar is hidden from assistive technology. */
  decorative?: boolean;
}

/** Named by `name` as an image, unless `decorative`. */
export function Avatar({
  name,
  initials,
  colour,
  size,
  decorative = false,
}: AvatarProps): ReactNode {
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative ? "true" : undefined}
      data-who={colour ?? undefined}
      className={cn(CIRCLE, SIZES[size])}
    >
      {initials ?? <PlusIcon aria-hidden="true" />}
    </span>
  );
}

interface StackPerson {
  userId: string;
  name: string;
  initials: string;
  /** The person's index in the script, 1 to 10; null for a person without one. */
  colour: number | null;
}

/** At most three avatars 4 px apart, then a circle counting the rest; nothing for no one. */
export function AvatarStack({
  people,
  size,
}: {
  people: readonly StackPerson[];
  size: AvatarSize;
}): ReactNode {
  if (people.length === 0) return null;
  const more = people.length - SHOWN;
  return (
    <span className="inline-flex items-center gap-1">
      {people.slice(0, SHOWN).map((person) => (
        <Avatar
          key={person.userId}
          name={person.name}
          initials={person.initials}
          colour={person.colour}
          size={size}
        />
      ))}
      {more <= 0 ? null : (
        <span
          role="img"
          aria-label={DOCUMENT_WORDS.moreAvatarsName(more)}
          data-more
          className={cn(CIRCLE, SIZES[size])}
        >
          {DOCUMENT_WORDS.moreAvatars(more)}
        </span>
      )}
    </span>
  );
}
