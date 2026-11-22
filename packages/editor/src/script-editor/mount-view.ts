// The script editor's view: in the page's frame when there is a profile, else a plain view, with every transaction
// that changes the document applied inside the guard.
import type { Engine, PageProfile } from "@manent/pagination";
import { mark } from "@manent/perf";
import type { IdSource } from "@manent/schema";
import type { Plugin, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { nextElementFor } from "../keys/element-keys.ts";
import type { ElementContext } from "../keys/element-keys.ts";
import type { LayoutView } from "../page/config.ts";
import type { PageScaffold } from "../page/scaffold.ts";
import { mountPageView } from "../pagination/page-view.ts";
import type { PageViewPorts } from "../pagination/page-view.ts";
import type { ScrollPorts } from "../scroll/stability.ts";
import { mountPlainView } from "./plain-view.ts";
import type {
  DispatchGuardPort,
  EditorBinding,
  EditorWords,
  SettingsReader,
} from "./ports.ts";
import { isSpellingChecked } from "./spelling.ts";

/** What of the script editor's options the view is built from. */
interface MountOptions {
  place: HTMLElement;
  binding: EditorBinding;
  editable: boolean;
  personal: SettingsReader;
  ids: IdSource;
  guard: DispatchGuardPort;
  layoutEngine: Engine;
  ports: PageViewPorts;
  words: EditorWords;
  view: LayoutView;
}

/** A transaction that changes the document is applied inside the guard and timed. */
function guardedDispatch(
  guard: DispatchGuardPort,
): (view: EditorView, tr: Transaction) => void {
  return (view, tr) => {
    if (!tr.docChanged) {
      view.updateState(view.state.apply(tr));
      return;
    }
    guard.enter();
    try {
      mark("editor.dispatch", () => view.updateState(view.state.apply(tr)));
    } finally {
      guard.leave();
    }
  };
}

/** The view in `place`: in the page's frame when there is a profile, else a plain view. */
export function mountEditor(
  options: MountOptions,
  parts: {
    profile: PageProfile | null;
    context: ElementContext;
    plugins: { before: Plugin[]; after: Plugin[] };
    ports: ScrollPorts;
  },
): { view: EditorView; scaffold: PageScaffold | null; destroy(): void } {
  const { binding, editable, personal } = options;
  const shared = {
    place: options.place,
    doc: binding.doc,
    before: parts.plugins.before,
    plugins: parts.plugins.after,
    ids: options.ids,
    nextElement: nextElementFor(parts.context),
    dispatchTransaction: guardedDispatch(options.guard),
    editable: () => editable,
    spelling: () => isSpellingChecked(personal),
  };
  if (parts.profile === null)
    return {
      ...mountPlainView({ ...shared, ports: options.ports }),
      scaffold: null,
    };
  return mountPageView({
    ...shared,
    profile: parts.profile,
    layoutEngine: options.layoutEngine,
    ports: options.ports,
    offFontNote: options.words.offFontNote,
    isRemote: binding.isRemote,
    scroller: parts.ports.scroller,
    view: options.view,
  });
}
