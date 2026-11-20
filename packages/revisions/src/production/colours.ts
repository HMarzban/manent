import type { ColourOrderId } from "./model.ts";

/** Every paper a revision is issued on; the interface's RevisionColour is the same list. */
export const REVISION_COLOURS = [
  "white",
  "blue",
  "pink",
  "yellow",
  "green",
  "goldenrod",
  "buff",
  "salmon",
  "cherry",
  "tan",
] as const;
export type RevisionColour = (typeof REVISION_COLOURS)[number];

/** The colours a revision takes, in turn, under each colour order. */
export const COLOUR_ORDERS: Readonly<
  Record<ColourOrderId, readonly RevisionColour[]>
> = Object.freeze({
  standard: Object.freeze(REVISION_COLOURS.slice(0, -1)),
  extended: REVISION_COLOURS,
});

/** Print text: the name of each colour as a page header writes it. */
export const COLOUR_NAMES: Readonly<Record<RevisionColour, string>> =
  Object.freeze({
    white: "White",
    blue: "Blue",
    pink: "Pink",
    yellow: "Yellow",
    green: "Green",
    goldenrod: "Goldenrod",
    buff: "Buff",
    salmon: "Salmon",
    cherry: "Cherry",
    tan: "Tan",
  });

/** The word in front of a colour's name in each cycle after the first; from cycle 10 on, the name reads "11th Blue". */
export const CYCLE_WORDS: readonly string[] = Object.freeze([
  "",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
]);

interface Turn {
  readonly cycle: number;
  readonly colour: RevisionColour;
}

// White comes once; every later ordinal runs through the rest of the order, cycle after cycle.
function turnOf(order: readonly RevisionColour[], ordinal: number): Turn {
  if (!Number.isInteger(ordinal) || ordinal < 0) {
    throw new RangeError(
      `a revision ordinal must be a non-negative integer, not ${ordinal}`,
    );
  }
  if (order.length < 2) {
    throw new RangeError(
      `a colour order needs at least 2 colours, not ${order.length}`,
    );
  }
  if (ordinal === 0) return { cycle: 0, colour: order[0]! };
  const span = order.length - 1;
  const step = ordinal - 1;
  return {
    cycle: Math.floor(step / span),
    colour: order[1 + (step % span)]!,
  };
}

function cycleWord(cycle: number): string {
  const word = CYCLE_WORDS[cycle];
  if (word !== undefined) return word;
  const n = cycle + 1;
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

/** The paper of revision `ordinal` (0 is the White production draft); RangeError for an ordinal that is not a non-negative integer. */
export function revisionColour(
  order: readonly RevisionColour[],
  ordinal: number,
): RevisionColour {
  return turnOf(order, ordinal).colour;
}

/** "White", "Blue" … "Cherry", then "Second Blue", "Third Blue" … "Tenth Blue", "11th Blue". */
export function revisionName(
  order: readonly RevisionColour[],
  ordinal: number,
): string {
  const { cycle, colour } = turnOf(order, ordinal);
  const name = COLOUR_NAMES[colour];
  return cycle === 0 ? name : `${cycleWord(cycle)} ${name}`;
}

/** "White → Blue → Pink → … → Cherry". */
export function colourOrderText(order: readonly RevisionColour[]): string {
  return order.map((colour) => COLOUR_NAMES[colour]).join(" → ");
}
