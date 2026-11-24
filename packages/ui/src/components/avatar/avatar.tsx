// A person as a circle of their initials, in their colour inside a script and a ring everywhere else; and the
// people on a document as a row of them. The one motion that repeats is an avatar's while its person types.
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
/** `apart`: at most three avatars 4 px apart; `overlapping`: at most two, the second under the edge of the first. */
type StackLayout = "apart" | "overlapping";
const LAYOUTS: Readonly<
  Record<StackLayout, { shown: number; className: string }>
> = Object.freeze({
  apart: { shown: 3, className: "gap-1" },
  overlapping: { shown: 2, className: "mn-avatar-overlap" },
});
// up and down while the person types; under reduced motion the theme stills it, and the initials are underlined
const MOVING =
  "animate-bounce motion-reduce:underline motion-reduce:underline-offset-2";

interface AvatarProps {
  name: string;
  /** null draws a plus in their place: the person not yet chosen ("You"). */
  initials: string | null;
  /** The person's index in the script, 1 to 10; null outside a script or for a person without one. */
  colour: number | null;
  size: AvatarSize;
  /** Inside a control already named by the person, the avatar is hidden from assistive technology. */
  decorative?: boolean;
  /** The person is typing: shown, never said, so that nothing is announced at each key. */
  moving?: boolean;
}

/** Named by `name` as an image, unless `decorative`. */
export function Avatar({
  name,
  initials,
  colour,
  size,
  decorative = false,
  moving = false,
}: AvatarProps): ReactNode {
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative ? "true" : undefined}
      data-who={colour ?? undefined}
      className={cn(CIRCLE, SIZES[size], moving && MOVING)}
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

/** The avatars `layout` shows, then a circle counting the rest; nothing for no one. */
export function AvatarStack({
  people,
  size,
  moving,
  layout = "apart",
}: {
  people: readonly StackPerson[];
  size: AvatarSize;
  /** The userIds of the people typing. */
  moving?: ReadonlySet<string>;
  layout?: StackLayout;
}): ReactNode {
  if (people.length === 0) return null;
  const { shown, className } = LAYOUTS[layout];
  const more = people.length - shown;
  return (
    <span className={cn("inline-flex items-center", className)}>
      {people.slice(0, shown).map((person) => (
        <Avatar
          key={person.userId}
          name={person.name}
          initials={person.initials}
          colour={person.colour}
          size={size}
          moving={moving?.has(person.userId) ?? false}
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
