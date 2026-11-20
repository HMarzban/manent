// One handler per command, each thin: it moves focus, opens a surface, navigates or writes a store.
import type { CommandHandlers } from "@manent/commands";
import { SETTINGS } from "@manent/settings";
import type { Api } from "../api.ts";
import type { PersonServices, ShellState } from "../services/ports.ts";
import type { ShellDom } from "../shell/regions.tsx";
import type { PersonStore } from "../state/person.store.ts";
import { appHandlers } from "./app.ts";
import { demoHandlers } from "./demo.ts";
import { documentHandlers } from "./document.ts";
import { createEditorHandlers } from "./editor.ts";
import { libraryHandlers } from "./library.ts";
import { preferencesHandlers } from "./preferences.ts";
import { syncHandlers } from "./sync.ts";

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

export interface HandlerDeps {
  services: PersonServices;
  api: Api;
  usePerson: PersonStore;
  router: Navigation;
  dom: ShellDom;
  shellState: () => ShellState;
  frame: (fn: () => void) => () => void;
  /** The undo list of the Preferences screen while it is shown; it sets `current` itself. */
  visitUndo: { current: { undo(): boolean } | null };
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
    ...libraryHandlers(deps),
    ...demoHandlers(),
    ...syncHandlers(),
  };
}
