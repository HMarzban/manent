// The person menu: the person's avatar, opening what acts on them.
import { Avatar, CommandMenu } from "@manent/ui";
import type { ReactNode } from "react";

/** The first letter of the first two words of `name`: "Dana Reyes" is "DR". */
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("");

/** Outside a script a person has no colour; the avatar names the menu's button. */
export function PersonMenu(props: { name: string }): ReactNode {
  const { name } = props;
  return (
    <CommandMenu
      menu="person"
      label={name}
      trigger={
        <Avatar
          name={name}
          initials={initialsOf(name)}
          colour={null}
          size="md"
        />
      }
    />
  );
}
