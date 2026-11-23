// A workspace's settings: `/w/$workspaceId/settings` and `/w/$workspaceId/settings/$group`.
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { createElement } from "react";
import { loadScreen } from "../router.tsx";
import { ScreenProblem } from "./screen-problem.ts";

const WorkspaceSettingsScreen = lazyRouteComponent(
  loadScreen(
    () => import("../screens/workspace-settings/workspace-settings-screen.tsx"),
  ),
  "WorkspaceSettingsScreen",
);

export function workspaceSettingsRoutes(root: AnyRoute): readonly AnyRoute[] {
  const settingsRoute = createRoute({
    getParentRoute: () => root,
    path: "/w/$workspaceId/settings",
    component: function WorkspaceSettings() {
      const { workspaceId } = settingsRoute.useParams();
      return createElement(WorkspaceSettingsScreen, {
        workspaceId,
        group: null,
      });
    },
    errorComponent: ScreenProblem,
  });

  const groupRoute = createRoute({
    getParentRoute: () => root,
    path: "/w/$workspaceId/settings/$group",
    component: function WorkspaceSettingsGroup() {
      const { workspaceId, group } = groupRoute.useParams();
      return createElement(WorkspaceSettingsScreen, { workspaceId, group });
    },
    errorComponent: ScreenProblem,
  });

  return [settingsRoute, groupRoute];
}
