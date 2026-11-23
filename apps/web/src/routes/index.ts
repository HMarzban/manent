// The app's route groups, one per line: a screen adds its own file and one line here.
import type { AnyRoute } from "@tanstack/react-router";
import type { Api } from "../api.ts";
import type { PersonStore } from "../state/person.store.ts";
import { developmentRoutes } from "./development.ts";
import { documentRoutes } from "./document.ts";
import { libraryRoutes } from "./library.ts";
import { preferencesRoutes } from "./preferences.ts";

export interface AppRouterDeps {
  api: Api;
  fetch: typeof fetch;
  usePerson: PersonStore;
}

/** Each group's routes, under the root route, in list order. */
export const ROUTE_GROUPS: readonly ((
  root: AnyRoute,
  deps: AppRouterDeps,
) => readonly AnyRoute[])[] = [
  libraryRoutes,
  documentRoutes,
  preferencesRoutes,
  developmentRoutes,
];
