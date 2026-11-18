/** The element picker's keys, in its order. */
export const ELEMENT_SLOTS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0",
  "E",
  "M",
  "C",
  "G",
] as const;
export type ElementSlot = (typeof ELEMENT_SLOTS)[number];
