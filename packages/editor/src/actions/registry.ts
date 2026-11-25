// Every kind of editor action, under its kind, one per line: the action a command, the Ruler or the Layout group asks
// the editor to run is one of these.
import type { ActionEntry } from "./action-types.ts";
import { dualDialogueEntry } from "./dual.ts";
import { elementEntry, pickerEntry } from "./element.ts";
import { alignEntry, layoutEntry, spaceBeforeEntry } from "./layout.ts";
import {
  findEntry,
  findNextEntry,
  findPreviousEntry,
  goToEntry,
  goToPersonEntry,
  replaceAllEntry,
  replaceEntry,
  stepSceneEntry,
  synopsisEntry,
} from "./loaded-apart.ts";
import { pageBreakEntry } from "./page-break.ts";
import {
  renameCharacterEntry,
  renameLocationEntry,
} from "./rename-character.ts";
import { colourEntry, highlightEntry, styleEntry } from "./styles.ts";
import { redoEntry, undoEntry } from "./undo.ts";

export const EDITOR_ACTIONS = Object.freeze({
  element: elementEntry,
  picker: pickerEntry,
  dual_dialogue: dualDialogueEntry,
  page_break: pageBreakEntry,
  style: styleEntry,
  colour: colourEntry,
  highlight: highlightEntry,
  align: alignEntry,
  space_before: spaceBeforeEntry,
  layout: layoutEntry,
  undo: undoEntry,
  redo: redoEntry,
  find: findEntry,
  find_next: findNextEntry,
  find_previous: findPreviousEntry,
  replace: replaceEntry,
  replace_all: replaceAllEntry,
  synopsis: synopsisEntry,
  go_to: goToEntry,
  step_scene: stepSceneEntry,
  go_to_person: goToPersonEntry,
  rename_character: renameCharacterEntry,
  rename_location: renameLocationEntry,
});

type ActionOf<E> = E extends ActionEntry<infer A> ? A : never;

/** What the editor is asked to run: one action of a kind in `EDITOR_ACTIONS`. */
export type EditorAction = ActionOf<
  (typeof EDITOR_ACTIONS)[keyof typeof EDITOR_ACTIONS]
>;
