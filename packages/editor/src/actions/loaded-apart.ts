// The actions whose code loads apart from the editor the first time one is asked for: finding, moving the caret and
// a synopsis. Each answers `ok` at once and runs once loaded.
import type { EditorView } from "prosemirror-view";
import type {
  ActionContext,
  ActionEntry,
  ActionResult,
} from "./action-types.ts";

/**
 * `find` sets the text the Find bar looks for; `replace` and `replace_all` write `text` in place of the match the
 * selection holds, or of every match. `synopsis` writes the one-line summary of the scene whose heading is `blockId`.
 * `step_scene` puts the caret at the next scene's heading (1) or the previous one's (-1), and `go_to_person` at the
 * cursor of the person present `userId`; each focuses the page.
 */
type LoadedApart =
  | { kind: "find"; search: string }
  | { kind: "find_next" }
  | { kind: "find_previous" }
  | { kind: "replace"; text: string }
  | { kind: "replace_all"; text: string }
  | { kind: "synopsis"; blockId: string; text: string }
  | { kind: "step_scene"; direction: 1 | -1 }
  | { kind: "go_to_person"; userId: string };

type Loaded<K extends LoadedApart["kind"]> = ActionEntry<
  Extract<LoadedApart, { kind: K }>
>;

// one load for every action, so that actions asked for while it loads run in the order they were asked for
let apart: Promise<typeof import("./apart-actions.ts")> | null = null;

function runLoaded(
  view: EditorView,
  action: LoadedApart,
  context: ActionContext,
): ActionResult {
  apart ??= import("./apart-actions.ts");
  void apart.then(({ runApart }) => {
    if (!view.isDestroyed) runApart(view, action, context.goTo);
  });
  return { ok: true };
}

export const findEntry: Loaded<"find"> = { readOnly: true, run: runLoaded };
export const findNextEntry: Loaded<"find_next"> = {
  readOnly: true,
  run: runLoaded,
};
export const findPreviousEntry: Loaded<"find_previous"> = {
  readOnly: true,
  run: runLoaded,
};
export const replaceEntry: Loaded<"replace"> = {
  readOnly: false,
  run: runLoaded,
};
export const replaceAllEntry: Loaded<"replace_all"> = {
  readOnly: false,
  run: runLoaded,
};
export const synopsisEntry: Loaded<"synopsis"> = {
  readOnly: false,
  run: runLoaded,
};
export const stepSceneEntry: Loaded<"step_scene"> = {
  readOnly: true,
  run: runLoaded,
};
export const goToPersonEntry: Loaded<"go_to_person"> = {
  readOnly: true,
  run: runLoaded,
};
