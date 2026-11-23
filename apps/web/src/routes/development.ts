// The development screens: `/__states`, `/__stand-in` and `/__keys`, served by the test build only.
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { loadScreen } from "../router.tsx";
import { ScreenProblem } from "./screen-problem.ts";

// the build's define; absent outside a build
declare const MANENT_FLAVOUR: string | undefined;

/** None outside the test build, which then holds none of their code. */
export function developmentRoutes(root: AnyRoute): readonly AnyRoute[] {
  return typeof MANENT_FLAVOUR !== "undefined" && MANENT_FLAVOUR === "test"
    ? [
        createRoute({
          getParentRoute: () => root,
          path: "/__states",
          component: lazyRouteComponent(
            loadScreen(() => import("../screens/states/states-screen.tsx")),
            "StatesScreen",
          ),
          errorComponent: ScreenProblem,
        }),
        createRoute({
          getParentRoute: () => root,
          path: "/__stand-in",
          component: lazyRouteComponent(
            loadScreen(() => import("../screens/states/stand-in-screen.tsx")),
            "StandInScreen",
          ),
          errorComponent: ScreenProblem,
        }),
        createRoute({
          getParentRoute: () => root,
          path: "/__keys",
          component: lazyRouteComponent(
            loadScreen(
              () => import("../screens/key-probe/key-probe-screen.tsx"),
            ),
            "KeyProbeScreen",
          ),
          errorComponent: ScreenProblem,
        }),
      ]
    : [];
}
