// The words of a speech's alternates: the popover, the marker at the end of the speech, and what is said and printed.

export const MATERIAL_WORDS = Object.freeze({
  /** The popover's accessible name. */
  alternates: "Alternates",
  useThis: "Use this",
  /** The tag of an alternate pitched from the room. */
  pitched: "Pitched",
  /** The field under the list: its placeholder, then its accessible name. */
  anotherWay: "Type another way to say this line. Enter swaps it in.",
  anotherWayName: "Another way to say this line",
  /** The marker of a speech with `count` alternates, and its accessible name: the shown line is the first of them. */
  marker: (count: number): string => `1/${count + 1}`,
  markerName: (count: number): string => `Alternates, 1 of ${count + 1}`,
  /** After a swap; `name` is the alternate's writer, null when it is the person who swapped. */
  swapped: (name: string | null): string =>
    name === null
      ? "Swapped in your alternate."
      : `Swapped in ${name}'s alternate.`,
  printWithAlternates: "Print with alternates",
  /** Printed after each alternate's line. */
  printedMark: "(alternate)",
});
