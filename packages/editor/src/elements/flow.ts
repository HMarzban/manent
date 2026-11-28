// The Enter and Tab flow of every format: the screenplay's table, written once, read through each format's own elements.
import { ACT_BREAK_KINDS, FORMAT_ELEMENTS } from "@manent/schema";
import type { ActBreakKind, BlockType, FormatId } from "@manent/schema";
import type { ElementRef } from "./slots.ts";

export type FlowTarget =
  | { readonly to: ElementRef }
  | { readonly to: "picker" }
  | { readonly to: "nothing" }
  | { readonly to: "heading_part" };

/** Where Enter with text, Tab at the end of text, Tab on an empty line and Enter on an empty line lead. */
export interface FlowRow {
  readonly enter: FlowTarget;
  readonly tabAtEnd: FlowTarget;
  readonly tabEmpty: FlowTarget;
  readonly enterEmpty: FlowTarget;
}

export interface FlowPrefs {
  readonly enterAfterDialogue: "action" | "character";
}

/** An element as the table names it: an act break by its kind. */
type TableElement = Exclude<BlockType, "act_break"> | ActBreakKind;

/** "same": the element itself; "after_dialogue": the person's choice of what follows dialogue. */
type Cell =
  | TableElement
  | "same"
  | "after_dialogue"
  | "picker"
  | "nothing"
  | "heading_part";
type Cells = readonly [
  enter: Cell,
  tabAtEnd: Cell,
  tabEmpty: Cell,
  enterEmpty: Cell,
];

const HEADING: Cells = ["action", "heading_part", "action", "picker"];
const ACTION: Cells = ["same", "character", "character", "picker"];
const TO_SCENE: Cells = [
  "scene_heading",
  "scene_heading",
  "scene_heading",
  "picker",
];
const TO_BODY: Cells = ["body", "body", "body", "picker"];
const BODY: Cells = ["body", "quote", "nothing", "picker"];
const INK: Cells = ["ink_line", "nothing", "nothing", "ink_line"];

// In the table's order, which Shift+Tab reads. General, a page break and an
// Ink line outside Ink take the Action row; Teaser and Tag the New Act row.
const ROWS: Readonly<Record<TableElement, Cells>> = Object.freeze({
  scene_heading: HEADING,
  slug: HEADING,
  action: ACTION,
  bracket: ACTION,
  emote: ACTION,
  camera: ACTION,
  engine: ACTION,
  general: ACTION,
  page_break: ACTION,
  graphic: ["action", "nothing", "nothing", "action"],
  ink_line: ACTION,
  character: ["dialogue", "parenthetical", "transition", "action"],
  parenthetical: ["dialogue", "dialogue", "dialogue", "dialogue"],
  dialogue: ["after_dialogue", "parenthetical", "character", "action"],
  transition: TO_SCENE,
  shot: ["action", "action", "action", "picker"],
  new_act: TO_SCENE,
  teaser: TO_SCENE,
  tag: TO_SCENE,
  end_of_act: ["new_act", "new_act", "new_act", "picker"],
  group: TO_SCENE,
  chapter: TO_BODY,
  subheading: TO_BODY,
  epigraph: ["body", "body", "body", "body"],
  break: TO_BODY,
  body: BODY,
  quote: ["body", "body", "body", "body"],
});

function isTableElement(key: string): key is TableElement {
  return Object.hasOwn(ROWS, key);
}

const TABLE_ORDER: readonly TableElement[] = Object.freeze(
  Object.keys(ROWS).filter(isTableElement),
);

interface FormatFlow {
  /** The format's own element in place of a screenplay element the table names. */
  readonly names: Readonly<Partial<Record<BlockType, BlockType>>>;
  /** The rows that differ from the screenplay's. */
  readonly rows: Readonly<Partial<Record<TableElement, Cells>>>;
}

const SCREENPLAY: FormatFlow = Object.freeze({ names: {}, rows: {} });

const FLOW: Readonly<Record<FormatId, FormatFlow>> = Object.freeze({
  screenplay: SCREENPLAY,
  multicam: SCREENPLAY,
  animation: SCREENPLAY,
  variety: Object.freeze({
    names: Object.freeze({ scene_heading: "slug", action: "bracket" }),
    rows: {},
  }),
  game: SCREENPLAY,
  ink: Object.freeze({
    names: {},
    rows: Object.freeze(Object.fromEntries(TABLE_ORDER.map((e) => [e, INK]))),
  }),
  manuscript: Object.freeze({
    names: Object.freeze({ scene_heading: "chapter", action: "body" }),
    rows: Object.freeze({ page_break: BODY }),
  }),
  stage_play: Object.freeze({
    names: Object.freeze({ transition: "action", shot: "action" }),
    rows: {},
  }),
});

function isActBreakKind(element: TableElement): element is ActBreakKind {
  return ACT_BREAK_KINDS.some((kind) => kind === element);
}

// An act break with no kind is laid out as a new act, so it flows as one.
function tableElement(element: ElementRef): TableElement {
  return element.type === "act_break"
    ? (element.kind ?? "new_act")
    : element.type;
}

function elementRef(element: TableElement): ElementRef {
  return isActBreakKind(element)
    ? { type: "act_break", kind: element }
    : { type: element, kind: null };
}

function named(flow: FormatFlow, element: TableElement): ElementRef {
  const { type, kind } = elementRef(element);
  return { type: flow.names[type] ?? type, kind };
}

function target(
  cell: Cell,
  element: ElementRef,
  flow: FormatFlow,
  prefs: FlowPrefs,
): FlowTarget {
  if (cell === "same") return { to: element };
  if (cell === "picker" || cell === "nothing" || cell === "heading_part")
    return { to: cell };
  return {
    to: named(
      flow,
      cell === "after_dialogue" ? prefs.enterAfterDialogue : cell,
    ),
  };
}

export function flowRow(
  format: FormatId,
  element: ElementRef,
  prefs: FlowPrefs,
): FlowRow {
  const flow = FLOW[format];
  const key = tableElement(element);
  const [enter, tabAtEnd, tabEmpty, enterEmpty] = flow.rows[key] ?? ROWS[key];
  return {
    enter: target(enter, element, flow, prefs),
    tabAtEnd: target(tabAtEnd, element, flow, prefs),
    tabEmpty: target(tabEmpty, element, flow, prefs),
    enterEmpty: target(enterEmpty, element, flow, prefs),
  };
}

/** Shift+Tab never makes a line one of the elements every format has for its structure. */
const STRUCTURE: readonly BlockType[] = Object.freeze([
  "act_break",
  "group",
  "page_break",
  "graphic",
]);

/**
 * The element whose Tab on an empty line leads to `element`, from the first
 * such row in the table's order among the format's own elements; null: none.
 */
export function shiftTabTarget(
  format: FormatId,
  element: ElementRef,
  prefs: FlowPrefs,
): ElementRef | null {
  for (const candidate of TABLE_ORDER) {
    const from = elementRef(candidate);
    if (
      STRUCTURE.includes(from.type) ||
      !FORMAT_ELEMENTS[format].includes(from.type)
    )
      continue;
    const { to } = flowRow(format, from, prefs).tabEmpty;
    if (
      typeof to === "object" &&
      to.type === element.type &&
      to.kind === element.kind
    )
      return from;
  }
  return null;
}
