// The letters a name tab shows for a person.

/** The first letters of the first two words of the name, upper-cased: "Dana Reyes" is "DR", "You" is "Y". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== "")
    .slice(0, 2)
    .map((word) => (Array.from(word)[0] ?? "").toUpperCase())
    .join("");
}
