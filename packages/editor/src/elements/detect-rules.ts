// The shortcuts that turn a line into another element: a line's first characters as they are typed, or a capital line on Enter.
import type { ActBreakKind, BlockType, FormatId } from "@manent/schema";
import type { ElementRef } from "./slots.ts";

export type Detection = {
  readonly to: ElementRef;
  readonly when: "typed" | "enter";
};

export const SCENE_INTROS = ["INT.", "EXT.", "EST.", "I/E."] as const;

interface Rule {
  readonly when: Detection["when"];
  /** The elements a line is converted from; null: any. */
  readonly from: readonly BlockType[] | null;
  /** The elements the line before must be; null: any, or none at all. */
  readonly after: readonly BlockType[] | null;
  /** The element the line's whole text names; null: none. */
  readonly read: (text: string) => ElementRef | null;
}

const plain = (type: BlockType): ElementRef => ({ type, kind: null });
const actBreak = (kind: ActBreakKind): ElementRef => ({
  type: "act_break",
  kind,
});

const TYPED_INTROS: readonly string[] = Object.freeze(
  SCENE_INTROS.map((intro) => `${intro} `),
);
const BRANCH_STARTS: readonly string[] = Object.freeze([
  "*",
  "+",
  "-",
  "{",
  "#",
]);
const ACTION_OR_GENERAL: readonly BlockType[] = Object.freeze([
  "action",
  "general",
]);
const LOWER_CASE = /\p{Ll}/u;
const ACT_NAME = /^ACT(?: \p{Lu}+)+$/u;

function actBreakNamed(text: string): ElementRef | null {
  if (ACT_NAME.test(text)) return actBreak("new_act");
  if (text === "TEASER") return actBreak("teaser");
  if (text === "TAG") return actBreak("tag");
  if (text === "END OF ACT" || text.startsWith("END OF ACT "))
    return actBreak("end_of_act");
  return null;
}

const RULES = Object.freeze({
  scene_intro: {
    when: "typed",
    from: ACTION_OR_GENERAL,
    after: null,
    read: (text) =>
      TYPED_INTROS.includes(text.toUpperCase()) ? plain("scene_heading") : null,
  },
  parenthetical: {
    when: "typed",
    from: Object.freeze(["action", "dialogue", "general"]),
    after: Object.freeze(["character", "dialogue", "parenthetical"]),
    read: (text) => (text === "(" ? plain("parenthetical") : null),
  },
  bracket: {
    when: "typed",
    from: null,
    after: null,
    read: (text) => (text === "[" ? plain("bracket") : null),
  },
  branch: {
    when: "typed",
    from: null,
    after: null,
    read: (text) => (BRANCH_STARTS.includes(text) ? plain("general") : null),
  },
  transition: {
    when: "enter",
    from: ACTION_OR_GENERAL,
    after: null,
    read: (text) =>
      text.endsWith("TO:") && !LOWER_CASE.test(text)
        ? plain("transition")
        : null,
  },
  act_break: {
    when: "enter",
    from: ACTION_OR_GENERAL,
    after: null,
    read: actBreakNamed,
  },
} satisfies Record<string, Rule>);
type RuleName = keyof typeof RULES;

const rules = (...names: RuleName[]): readonly RuleName[] =>
  Object.freeze(names);

const SCREENPLAY = rules(
  "scene_intro",
  "parenthetical",
  "transition",
  "act_break",
);

const FORMAT_RULES: Readonly<Record<FormatId, readonly RuleName[]>> =
  Object.freeze({
    screenplay: SCREENPLAY,
    multicam: SCREENPLAY,
    animation: SCREENPLAY,
    variety: rules("parenthetical", "bracket", "transition", "act_break"),
    game: rules(
      "scene_intro",
      "parenthetical",
      "branch",
      "transition",
      "act_break",
    ),
    ink: rules(),
    manuscript: rules(),
    // a stage play has no transition
    stage_play: rules("scene_intro", "parenthetical", "act_break"),
  });

function applies(
  rule: Rule,
  element: ElementRef,
  previous: ElementRef | null,
): boolean {
  if (rule.from !== null && !rule.from.includes(element.type)) return false;
  return (
    rule.after === null ||
    (previous !== null && rule.after.includes(previous.type))
  );
}

function detect(
  format: FormatId,
  when: Detection["when"],
  element: ElementRef,
  previous: ElementRef | null,
  text: string,
): ElementRef | null {
  for (const name of FORMAT_RULES[format]) {
    const rule: Rule = RULES[name];
    if (rule.when !== when || !applies(rule, element, previous)) continue;
    const to = rule.read(text);
    if (to !== null && (to.type !== element.type || to.kind !== element.kind))
      return to;
  }
  return null;
}

/** The element a line becomes when `text` is typed into an empty block of `element`, or Enter is pressed after it; null: no conversion. */
export function detectTyped(
  format: FormatId,
  element: ElementRef,
  previous: ElementRef | null,
  text: string,
): ElementRef | null {
  return detect(format, "typed", element, previous, text);
}

/** As detectTyped, for Enter pressed after a line of `element` holding `text`. */
export function detectOnEnter(
  format: FormatId,
  element: ElementRef,
  text: string,
): ElementRef | null {
  return detect(format, "enter", element, null, text);
}
