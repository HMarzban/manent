// One handler per command, each thin: it moves focus, opens a surface, navigates or writes a store.
import type { CommandHandlers } from "@manent/commands";
import { SETTINGS } from "@manent/settings";
import type { Api } from "../api.ts";
import type { DesktopHost } from "../desktop/host.ts";
import type { NodeCloud } from "../desktop/node-cloud.ts";
import type {
  Environment,
  PersonServices,
  ShellState,
} from "../services/ports.ts";
import { productionHandlers } from "../production/handlers.ts";
import type { ShellDom } from "../shell/regions.tsx";
import type { PersonStore } from "../state/person.store.ts";
import { appHandlers } from "./app.ts";
import { demoHandlers } from "./demo.ts";
import { createDesktopHandlers } from "./desktop.ts";
import { documentHandlers } from "./document.ts";
import { createEditorHandlers } from "./editor.ts";
import { historyHandlers } from "./history.ts";
import { importHandlers } from "./import.ts";
import { libraryHandlers } from "./library.ts";
import { navigationHandlers } from "./navigation.ts";
import { preferencesHandlers } from "./preferences.ts";
import { syncHandlers } from "./sync.ts";
import { commentsHandlers } from "./comments.ts";
import { writingHandlers } from "./writing.ts";
import { assignmentHandlers } from "./assignment.ts";
import { materialHandlers } from "./material.ts";
import { scenesHandlers } from "./scenes.ts";
import { roomHandlers } from "./room.ts";
import { shareHandlers } from "./share.ts";
import { draftsHandlers } from "./drafts.ts";
import { linksHandlers } from "./links.ts";
import { projectHandlers } from "./project.ts";
import { seriesHandlers } from "./series.ts";
import { namesHandlers } from "./names.ts";
import { checksHandlers } from "./checks.ts";
import { boardHandlers } from "./board.ts";
import { outlineHandlers } from "./outline.ts";
import { roomLogHandlers } from "./room-log.ts";
import { copiesHandlers } from "./copies.ts";
import { readerHandlers } from "./reader.ts";
import { besideHandlers } from "./beside.ts";
import { archiveHandlers } from "./archive.ts";
import { timingHandlers } from "./timing.ts";
import { rundownHandlers } from "./rundown.ts";
import { prompterHandlers } from "./prompter.ts";
import { scriptHandlers } from "./script.ts";
import { focusModeHandlers } from "./focus-mode.ts";

/** Where the window is: its route's id, its path with the search, and the search as read. */
export interface RoutePlace {
  routeId: string | null;
  href: string;
  search: Readonly<Record<string, unknown>>;
}

export interface Navigation {
  /** `href` is a path inside the app. */
  navigate(href: string): void;
  here(): RoutePlace;
}

export interface HandlerDeps extends Pick<
  Environment,
  "language" | "now" | "storage"
> {
  services: PersonServices;
  api: Api;
  usePerson: PersonStore;
  router: Navigation;
  dom: ShellDom;
  shellState: () => ShellState;
  frame: (fn: () => void) => () => void;
  /** The undo list of the Preferences screen while it is shown; it sets `current` itself. */
  visitUndo: { current: { undo(): boolean } | null };
  /** The desktop app's shell and node; null on the web. */
  desktop: DesktopHost | null;
  /** The person at the desktop app's node; null on the web. */
  nodeCloud: NodeCloud | null;
}

export function createHandlers(deps: HandlerDeps): CommandHandlers {
  const docId = (): string | null => deps.shellState().docId;
  // the open script's format as Script settings names it ("Stage play")
  const formatLabel = (): string | null => {
    const shown = docId();
    if (shown === null) return null;
    const format = deps.services.openScriptStore(shown).get("script.format");
    const { choices } = SETTINGS.get("script.format").type;
    return choices?.find((choice) => choice.value === format)?.label ?? null;
  };
  return {
    ...appHandlers(deps),
    ...preferencesHandlers(deps),
    ...documentHandlers(deps),
    ...createEditorHandlers({
      control: deps.services.editor,
      messages: deps.services.messages,
      formatLabel,
      docId,
      navigate: (path) => deps.router.navigate(path),
    }),
    ...navigationHandlers(deps),
    ...libraryHandlers(deps),
    ...importHandlers(deps),
    ...demoHandlers(),
    ...syncHandlers(deps),
    ...createDesktopHandlers(deps),
    ...historyHandlers(deps),
    ...productionHandlers(deps),
    ...commentsHandlers(deps),
    ...writingHandlers(deps),
    ...assignmentHandlers(deps),
    ...materialHandlers(deps),
    ...scenesHandlers(deps),
    ...roomHandlers(deps),
    ...shareHandlers(deps),
    ...draftsHandlers(deps),
    ...linksHandlers(deps),
    ...projectHandlers(deps),
    ...seriesHandlers(deps),
    ...namesHandlers(deps),
    ...checksHandlers(deps),
    ...boardHandlers(deps),
    ...outlineHandlers(deps),
    ...roomLogHandlers(deps),
    ...copiesHandlers(deps),
    ...readerHandlers(deps),
    ...besideHandlers(deps),
    ...archiveHandlers(deps),
    ...timingHandlers(deps),
    ...rundownHandlers(deps),
    ...prompterHandlers(deps),
    ...scriptHandlers(deps),
    ...focusModeHandlers(deps),
  };
}
