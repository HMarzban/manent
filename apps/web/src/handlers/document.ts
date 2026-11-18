// An open document's commands: its panels, History, Script settings and its name.
import type { CommandHandlers, PanelId } from "@manent/commands";
import { DOCUMENT_WORDS } from "@manent/ui";
import { panelsActions } from "../state/panels.store.ts";
import { renameActions } from "../state/rename.store.ts";
import type { HandlerDeps } from "./index.ts";

export function documentHandlers(
  deps: HandlerDeps,
): Pick<
  CommandHandlers,
  | "view.leftPanel"
  | "view.sidePanel"
  | "history.open"
  | "doc.scriptSettings"
  | "doc.rename"
> {
  const { dom, shellState, frame } = deps;
  // a bare toggle leaves focus where it is; with focus in the page, the panel is named aloud
  const toggle = (panel: PanelId, tab: string, name: string) => () => {
    panelsActions.toggle(panel, shellState().panels[panel] ?? tab);
    if (dom.pageFocused()) dom.announce(name);
  };
  // the command uses the panel, so focus moves into it once it is drawn
  const openSide = (tab: string) => () => {
    panelsActions.open("side", tab);
    frame(() => dom.focusSidePanel());
  };
  return {
    "view.leftPanel": toggle("left", "scenes", DOCUMENT_WORDS.leftPanel),
    "view.sidePanel": toggle("side", "details", DOCUMENT_WORDS.sidePanel),
    "history.open": openSide("history"),
    "doc.scriptSettings": openSide("details"),
    "doc.rename"() {
      const { docId } = shellState();
      if (docId !== null) renameActions.start(docId);
    },
  };
}
