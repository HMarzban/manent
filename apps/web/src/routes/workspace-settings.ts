// A workspace's settings: `/w/$workspaceId/settings` and `/w/$workspaceId/settings/$group`.
import {
  createRoute,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { createElement } from "react";
import { loadScreen } from "../router.tsx";
import { WORKSPACE_SETTINGS_GROUPS } from "../screens/workspace-settings/groups.ts";
import { chooseUrl, confirmPerson } from "../session.ts";
import type { AppRouterDeps } from "./index.ts";
import { ScreenProblem } from "./screen-problem.ts";

const WorkspaceSettingsScreen = lazyRouteComponent(
  loadScreen(
    () => import("../screens/workspace-settings/workspace-settings-screen.tsx"),
  ),
  "WorkspaceSettingsScreen",
);

const isGroup = (value: string): boolean =>
  WORKSPACE_SETTINGS_GROUPS.some((group) => group === value);

export function workspaceSettingsRoutes(
  root: AnyRoute,
  deps: AppRouterDeps,
): readonly AnyRoute[] {
  const { api, usePerson } = deps;

  const settingsRoute = createRoute({
    getParentRoute: () => root,
    path: "/w/$workspaceId/settings",
    beforeLoad: ({ params }) => {
      throw redirect({
        href: `/w/${encodeURIComponent(params.workspaceId)}/settings/people`,
        replace: true,
      });
    },
    component: function WorkspaceSettings() {
      const { workspaceId } = settingsRoute.useParams();
      return createElement(WorkspaceSettingsScreen, {
        workspaceId,
        group: "people",
      });
    },
    errorComponent: ScreenProblem,
  });

  const groupRoute = createRoute({
    getParentRoute: () => root,
    path: "/w/$workspaceId/settings/$group",
    beforeLoad: async ({ params, location }) => {
      const { person, setPerson } = usePerson.getState();
      const confirmed = await confirmPerson(person, api.me);
      if (confirmed === null) {
        setPerson(null);
        throw redirect({ href: chooseUrl(location.href), replace: true });
      }
      if (confirmed.token === null) {
        throw redirect({ href: "/", replace: true });
      }
      if (!isGroup(params.group)) {
        throw redirect({
          href: `/w/${encodeURIComponent(params.workspaceId)}/settings/people`,
          replace: true,
        });
      }
      const me = await api.me();
      if (
        me.ok &&
        !me.me.workspaces.some((ws) => ws.id === params.workspaceId)
      ) {
        throw redirect({ href: "/", replace: true });
      }
    },
    component: function WorkspaceSettingsGroup() {
      const { workspaceId, group } = groupRoute.useParams();
      return createElement(WorkspaceSettingsScreen, { workspaceId, group });
    },
    errorComponent: ScreenProblem,
  });

  return [settingsRoute, groupRoute];
}
