// The reader route `/r/$token`: a direct child of the root route that opens with or without a person chosen.
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { createElement } from "react";
import { loadScreen } from "../router.tsx";
import type { AppRouterDeps } from "./index.ts";
import { ScreenProblem } from "./screen-problem.ts";

const ReaderScreen = lazyRouteComponent(
  loadScreen(() => import("../screens/reader/reader-screen.tsx")),
  "ReaderScreen",
);

export function readerRoutes(
  root: AnyRoute,
  deps: AppRouterDeps,
): readonly AnyRoute[] {
  const readerRoute = createRoute({
    getParentRoute: () => root,
    path: "/r/$token",
    component: function Reader() {
      const { token } = readerRoute.useParams();
      return createElement(ReaderScreen, {
        token,
        api: deps.api,
        fetch: deps.fetch,
        usePerson: deps.usePerson,
      });
    },
    errorComponent: ScreenProblem,
  });
  return [readerRoute];
}
