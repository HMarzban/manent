// Project settings: `/p/$projectId/settings`, with Back's `from` and active `section` in the search.
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { loadScreen } from "../router.tsx";
import { safeNext } from "../session.ts";
import { ScreenProblem } from "./screen-problem.ts";

export const PROJECT_SECTIONS = [
  "format_style",
  "names_facts",
  "people",
  "drafts",
  "templates",
] as const;

export type ProjectSection = (typeof PROJECT_SECTIONS)[number];

const ProjectSettingsScreen = lazyRouteComponent(
  loadScreen(
    () => import("../screens/project-settings/project-settings-screen.tsx"),
  ),
  "ProjectSettingsScreen",
);

export function projectRoutes(root: AnyRoute): readonly AnyRoute[] {
  return [
    createRoute({
      getParentRoute: () => root,
      path: "/p/$projectId/settings",
      // where Back returns to and which section tab is open
      validateSearch: (
        search: Record<string, unknown>,
      ): { from: string; section: ProjectSection } => ({
        from: safeNext(typeof search.from === "string" ? search.from : null),
        section:
          PROJECT_SECTIONS.find((entry) => entry === search.section) ??
          "format_style",
      }),
      component: ProjectSettingsScreen,
      errorComponent: ScreenProblem,
    }),
  ];
}
