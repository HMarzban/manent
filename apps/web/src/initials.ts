// A person's initials, as their avatar shows them.

/** The first letter of the first two words of `name`: "Dana Reyes" is "DR". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
    .join("");
}
