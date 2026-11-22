// The actions loaded apart from the editor, the first time one is asked for: finding, moving the caret, a synopsis.
import type { EditorView } from "prosemirror-view";
import { runFind } from "../find/find-commands.ts";
import type { FindAction } from "../find/find-commands.ts";
import type { ActionResult, EditorAction } from "./action-types.ts";
import { runGoTo } from "./go-to.ts";
import type { GoToAction } from "./go-to.ts";
import { setSynopsis } from "./synopsis.ts";

type ApartAction =
  FindAction | GoToAction | Extract<EditorAction, { kind: "synopsis" }>;

/** Runs `action` on the view as it is now; `goTo` puts the caret in a block and focuses the page. */
export function runApart(
  view: EditorView,
  action: ApartAction,
  goTo: (blockId: string, offset: number) => void,
): ActionResult {
  switch (action.kind) {
    case "find":
    case "find_next":
    case "find_previous":
    case "replace":
    case "replace_all":
      return runFind(view, action);
    case "go_to":
    case "step_scene":
    case "go_to_person":
      return runGoTo(view, action, goTo);
    case "synopsis":
      return setSynopsis(
        view.state,
        action.blockId,
        action.text,
        view.dispatch,
      );
  }
}
