// One handler per command, each thin: it moves focus, opens a surface, navigates or writes a store.
import type { CommandHandlers } from "@manent/commands";
import type { Api } from "../api.ts";
import type { PersonServices, ShellState } from "../services/ports.ts";
import type { ShellDom } from "../shell/regions.tsx";
import type { PersonStore } from "../state/person.store.ts";
import { appHandlers } from "./app.ts";
import { demoHandlers } from "./demo.ts";
import { documentHandlers } from "./document.ts";
import { libraryHandlers } from "./library.ts";
import { preferencesHandlers } from "./preferences.ts";

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
  return {
    ...appHandlers(deps),
    ...preferencesHandlers(deps),
    ...documentHandlers(deps),
    ...libraryHandlers(deps),
    ...demoHandlers(),
  };
}
