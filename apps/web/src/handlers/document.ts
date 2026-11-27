// An open document's commands: its panels, tabs, History, Script settings, Lines per page and its name.
import type { CommandHandlers, LeftTab, PanelId } from "@manent/commands";
import { DOCUMENT_WORDS } from "@manent/ui";
import {
  SCRIPT_SETTINGS_PART,
  requestScriptSettingsOpen,
} from "../screens/document/script-settings-part.ts";
import { panelsActions } from "../state/panels.store.ts";
import { renameActions } from "../state/rename.store.ts";
import type { HandlerDeps } from "./index.ts";
import { askLinesPerPage } from "./numeric-settings.ts";

export function documentHandlers(
  deps: HandlerDeps,
): Pick<
  CommandHandlers,
  | "view.leftPanel"
  | "view.sidePanel"
  | "view.scenes"
  | "view.cuts"
  | "view.details"
  | "view.comments"
  | "history.open"
  | "doc.scriptSettings"
  | "doc.rename"
  | "doc.linesPerPage"
> {
  const { dom, shellState, frame } = deps;
  // a bare toggle leaves focus where it is; with focus in the page, the panel is named aloud
  const toggle = (panel: PanelId, tab: string, name: string) => () => {
    panelsActions.toggle(panel, shellState().panels[panel] ?? tab);
    if (dom.pageFocused()) dom.announce(name);
  };
  const openLeft = (tab: LeftTab) => () => {
    panelsActions.open("left", tab);
    frame(() => dom.focusLeftPanel());
  };
  // the command uses the panel, so focus moves into it, or into its part `within` selects, once it is drawn
  const openSide = (tab: string, within?: string) => () => {
    panelsActions.open("side", tab);
    frame(() => dom.focusSidePanel(within));
  };
  return {
    "view.leftPanel": toggle("left", "scenes", DOCUMENT_WORDS.leftPanel),
    "view.sidePanel": toggle("side", "details", DOCUMENT_WORDS.sidePanel),
    "view.scenes": openLeft("scenes"),
    "view.cuts": openLeft("cuts"),
    "view.details": openSide("details"),
    "view.comments": openSide("comments"),
    "history.open"() {
      const { docId } = shellState();
      const here = deps.router.here().routeId;
      if (docId !== null && here !== "/__stand-in") {
        if (here !== "/s/$docId/history")
          deps.router.navigate(`/s/${docId}/history`);
        frame(() => dom.focusSidePanel());
        return;
      }
      openSide("history")();
    },
    "doc.scriptSettings"() {
      requestScriptSettingsOpen();
      openSide("details", `[${SCRIPT_SETTINGS_PART}]`)();
    },
    "doc.rename"() {
      const { docId } = shellState();
      if (docId === null) return;
      // the rename gives focus back to what had it when it began
      dom.rememberFocus();
      renameActions.start(docId);
    },
    "doc.linesPerPage": () => askLinesPerPage(deps),
  };
}
