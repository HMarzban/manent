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
import { routeConfirmMe } from "../services/api-cache.ts";
import { chooseUrl, safeNext } from "../session.ts";
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
    beforeLoad: ({ params, location }) => {
      throw redirect({
        href: `/w/${encodeURIComponent(params.workspaceId)}/settings/people${location.searchStr}`,
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
    validateSearch: (
      search: Record<string, unknown>,
    ): { from: string | null } => ({
      from:
        typeof search.from === "string" && search.from.trim() !== ""
          ? safeNext(search.from)
          : null,
    }),
    beforeLoad: async ({ params, location }) => {
      const { person, setPerson } = usePerson.getState();
      if (person === null) {
        setPerson(null);
        throw redirect({ href: chooseUrl(location.href), replace: true });
      }
      if (person.token === null) {
        throw redirect({ href: "/", replace: true });
      }
      const me = await routeConfirmMe(api, person.token);
      if (!me.ok && me.reason === "unauthenticated") {
        setPerson(null);
        throw redirect({ href: chooseUrl(location.href), replace: true });
      }
      if (!isGroup(params.group)) {
        throw redirect({
          href: `/w/${encodeURIComponent(params.workspaceId)}/settings/people${location.searchStr}`,
          replace: true,
        });
      }
      if (
        me.ok &&
        !me.me.workspaces.some((ws) => ws.id === params.workspaceId)
      ) {
        throw redirect({ href: "/", replace: true });
      }
    },
    component: function WorkspaceSettingsGroup() {
      const { workspaceId, group } = groupRoute.useParams();
      const { from } = groupRoute.useSearch();
      return createElement(WorkspaceSettingsScreen, {
        workspaceId,
        group,
        from,
      });
    },
    errorComponent: ScreenProblem,
  });

  return [settingsRoute, groupRoute];
}
