// The app's route groups, one per line: a screen adds its own file and one line here.
import type { AnyRoute } from "@tanstack/react-router";
import type { Api } from "../api.ts";
import type { PersonStore } from "../state/person.store.ts";
import { aboutRoutes } from "./about.ts";
import { developmentRoutes } from "./development.ts";
import { documentRoutes } from "./document.ts";
import { libraryRoutes } from "./library.ts";
import { preferencesRoutes } from "./preferences.ts";
import { presentRoutes } from "./present.ts";
import { versionLinksRoutes } from "./version-links.ts";
import { joinRoutes } from "./join.ts";
import { readerRoutes } from "./reader.ts";
import { projectRoutes } from "./project.ts";
import { boardRoutes } from "./board.ts";
import { workspaceSettingsRoutes } from "./workspace-settings.ts";

export interface AppRouterDeps {
  api: Api;
  fetch: typeof fetch;
  usePerson: PersonStore;
  desktop?: boolean;
}

/** Each group's routes, under the root route, in list order. */
export const ROUTE_GROUPS: readonly ((
  root: AnyRoute,
  deps: AppRouterDeps,
) => readonly AnyRoute[])[] = [
  libraryRoutes,
  aboutRoutes,
  documentRoutes,
  preferencesRoutes,
  developmentRoutes,
  presentRoutes,
  versionLinksRoutes,
  joinRoutes,
  readerRoutes,
  projectRoutes,
  boardRoutes,
  workspaceSettingsRoutes,
];
