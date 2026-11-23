// Links into a script's history: `/s/$docId/v/$versionId` (that version as it was) and `/s/$docId/changes/$a/$b`
// (the changes since `$a`; `$b` is a version id or `working`).
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { loadScreen } from "../router.tsx";
import { ScreenProblem } from "./screen-problem.ts";

const loadLinks = loadScreen(() => import("../links/version-link.tsx"));

export function versionLinksRoutes(root: AnyRoute): readonly AnyRoute[] {
  const versionRoute = createRoute({
    getParentRoute: () => root,
    path: "/s/$docId/v/$versionId",
    component: lazyRouteComponent(loadLinks, "VersionLink"),
    errorComponent: ScreenProblem,
  });
  const changesRoute = createRoute({
    getParentRoute: () => root,
    path: "/s/$docId/changes/$a/$b",
    component: lazyRouteComponent(loadLinks, "ChangesLink"),
    errorComponent: ScreenProblem,
  });
  return [versionRoute, changesRoute];
}
