// Project settings: `/p/$projectId/settings`, with Back's `from` in the search.
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { loadScreen } from "../router.tsx";
import { safeNext } from "../session.ts";
import { ScreenProblem } from "./screen-problem.ts";

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
      // where Back returns to: a path inside the app
      validateSearch: (search: Record<string, unknown>): { from: string } => ({
        from: safeNext(typeof search.from === "string" ? search.from : null),
      }),
      component: ProjectSettingsScreen,
      errorComponent: ScreenProblem,
    }),
  ];
}
