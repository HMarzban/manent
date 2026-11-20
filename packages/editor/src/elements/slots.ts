import type { ActBreakKind, BlockType, FormatId } from "@manent/schema";

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

/** An element as a block holds it: `kind` is set on an act break only. */
export interface ElementRef {
  readonly type: BlockType;
  readonly kind: ActBreakKind | null;
}

const ref = (type: BlockType): ElementRef =>
  Object.freeze({ type, kind: null });
const actBreak = (kind: ActBreakKind): ElementRef =>
  Object.freeze({ type: "act_break", kind });

// Slot 2 is in every format: it is the element a pasted plain line becomes.
type FormatSlots = { readonly "2": ElementRef } & Readonly<
  Partial<Record<ElementSlot, ElementRef>>
>;

const SECTION_AND_ACTS = {
  "8": ref("group"),
  "9": actBreak("new_act"),
  E: actBreak("end_of_act"),
} as const;

const STAGE_PLAY: FormatSlots = Object.freeze({
  "1": ref("scene_heading"),
  "2": ref("action"),
  "3": ref("character"),
  "4": ref("parenthetical"),
  "5": ref("dialogue"),
  ...SECTION_AND_ACTS,
  "0": ref("general"),
});

const SCREENPLAY: FormatSlots = Object.freeze({
  ...STAGE_PLAY,
  "6": ref("transition"),
  "7": ref("shot"),
});

const SLOTS: Readonly<Record<FormatId, FormatSlots>> = Object.freeze({
  screenplay: SCREENPLAY,
  multicam: SCREENPLAY,
  animation: SCREENPLAY,
  variety: Object.freeze({
    ...SCREENPLAY,
    "1": ref("slug"),
    "2": ref("bracket"),
  }),
  game: Object.freeze({
    ...SCREENPLAY,
    M: ref("emote"),
    C: ref("camera"),
    G: ref("engine"),
  }),
  ink: Object.freeze({ "2": ref("ink_line"), ...SECTION_AND_ACTS }),
  manuscript: Object.freeze({
    "1": ref("chapter"),
    "2": ref("body"),
    "5": ref("quote"),
    "6": ref("break"),
    ...SECTION_AND_ACTS,
  }),
  stage_play: STAGE_PLAY,
});

/** The element a picker key sets in this format; null: the format does not offer it. */
export function slotElement(
  format: FormatId,
  slot: ElementSlot,
): ElementRef | null {
  return SLOTS[format][slot] ?? null;
}

/** The picker key of an element in this format; null: no key sets it. */
export function elementSlot(
  format: FormatId,
  element: ElementRef,
): ElementSlot | null {
  const slots = SLOTS[format];
  return (
    ELEMENT_SLOTS.find(
      (slot) =>
        slots[slot]?.type === element.type && slots[slot].kind === element.kind,
    ) ?? null
  );
}

/** A new script's first block: slot 1, or in Ink, which has none, its one element. */
export function firstElement(format: FormatId): ElementRef {
  return SLOTS[format]["1"] ?? SLOTS[format]["2"];
}

/** The element a pasted plain line becomes. */
export function plainTextElement(format: FormatId): ElementRef {
  return SLOTS[format]["2"];
}
