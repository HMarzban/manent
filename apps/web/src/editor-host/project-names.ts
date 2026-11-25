// The project's names on a document's page: near matches underlined and offered while Check spelling as I type is on,
// and the two name commands, which act at the caret of that page.
import {
  askAtCaret,
  isSpellingChecked,
  projectNamesPlugin as namesPlugin,
  wordAtCaret,
  writeListedSpelling,
} from "@manent/editor";
import type { Plugin } from "@manent/editor";
import { PROJECT_NAME_KINDS } from "@manent/revisions";
import type { ProjectNameKind } from "@manent/revisions";
import { NAMES_WORDS } from "@manent/ui";
import { documentNames } from "../names/project-names.ts";
import { liveEditor } from "./live-editor.ts";
import type { EditorPluginContext } from "./plugins.ts";

export function projectNamesPlugin(context: EditorPluginContext): Plugin {
  const { services, docId } = context;
  const names = documentNames(services, docId);
  return namesPlugin({
    layer: () => context.layer(),
    names: names.spellings,
    checked: () => isSpellingChecked(services.settings),
    subscribe(listener) {
      const stopNames = names.subscribe(listener);
      const stopChecked = services.settings.subscribe(
        "writing.checkSpelling",
        listener,
      );
      return () => {
        stopNames();
        stopChecked();
      };
    },
    describe: NAMES_WORDS.nearlyMatches,
  });
}

/** Writes the listed spelling over the underlined run the caret of `docId`'s page is in; false when it is in none. */
export function writeListedSpellingIn(docId: string): boolean {
  const editor = liveEditor(docId);
  return editor !== null && writeListedSpelling(editor.view);
}

/**
 * Asks at the caret of `docId`'s page whether the word there is a character, a set or a term, and tells `add` the
 * word and the kind chosen; false when the page is not open or the caret is on no word.
 */
export function askNameKindIn(
  docId: string,
  add: (word: string, kind: ProjectNameKind) => void,
): boolean {
  const editor = liveEditor(docId);
  const word = editor === null ? null : wordAtCaret(editor.view.state);
  if (editor === null || word === null) return false;
  askAtCaret(
    editor.view,
    PROJECT_NAME_KINDS.map((kind) => NAMES_WORDS.kinds[kind].choice),
    (index) => add(word, PROJECT_NAME_KINDS[index]!),
  );
  return true;
}
