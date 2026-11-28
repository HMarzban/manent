// A project's draft ladder: the labels its drafts are named after, in order, and the name a new draft is offered on it.
import { ladderLabelOf } from "@manent/crdt";
import type { SettingValue, SettingsStore } from "@manent/settings";
import { HISTORY_WORDS } from "@manent/ui";

const NO_LADDER: readonly string[] = Object.freeze([]);

/** Each template's own ladder, in use until the project sets one. */
export const TEMPLATE_LADDERS: Readonly<
  Record<SettingValue<"project.template">, readonly string[]>
> = Object.freeze({
  screenplay: NO_LADDER,
  drama: HISTORY_WORDS.seriesLadder,
  single_camera: HISTORY_WORDS.seriesLadder,
  multi_camera: HISTORY_WORDS.seriesLadder,
  animation: HISTORY_WORDS.animationLadder,
  variety: NO_LADDER,
  news: NO_LADDER,
  podcast: NO_LADDER,
  manuscript: NO_LADDER,
  game: NO_LADDER,
  stage_play: NO_LADDER,
  custom: HISTORY_WORDS.seriesLadder,
});

/** The ladder of the script whose settings `store` holds: the project's own once it has set one, even an empty one; else its template's. */
export function ladderInUse(store: SettingsStore): readonly string[] {
  const own = store.explain("project.ladder");
  return own.source === "own"
    ? own.value
    : TEMPLATE_LADDERS[store.get("project.template")];
}

/**
 * The name offered for a script's next draft, after the drafts already named `names`: the label of `ladder` after the
 * furthest one a name uses, or its first when none is used. With no ladder, or its last label used, it is the next of
 * First draft … Tenth draft, then Draft 11, Draft 12 …, counted by the drafts already named.
 */
export function proposeDraftName(
  names: readonly string[],
  ladder: readonly string[],
): string {
  const furthest = names.reduce((at, name) => {
    const label = ladderLabelOf(name, ladder);
    return label === null ? at : Math.max(at, ladder.indexOf(label));
  }, -1);
  const label = ladder[furthest + 1];
  if (label !== undefined) return label;
  const n = names.length + 1;
  return HISTORY_WORDS.ordinals[n - 1] ?? HISTORY_WORDS.draftNumber(n);
}
