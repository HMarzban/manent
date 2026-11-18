// The person menu: the person's initials in an avatar, opening what acts on them.
import { CommandMenu } from "@manent/ui";
import type { ReactNode } from "react";

/** The first letter of the first two words of `name`: "Dana Reyes" is "DR". */
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("");

export function PersonMenu(props: { name: string }): ReactNode {
  const { name } = props;
  return (
    <CommandMenu
      menu="person"
      label={name}
      trigger={
        <span className="inline-flex size-avatar items-center justify-center rounded-full bg-control text-micro">
          {initialsOf(name)}
        </span>
      }
    />
  );
}
