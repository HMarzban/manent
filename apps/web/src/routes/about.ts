// The About Manent route `/about`: opens in a compact standalone desktop window with or without a person chosen.
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { loadScreen } from "../router.tsx";
import { ScreenProblem } from "./screen-problem.ts";

const AboutScreen = lazyRouteComponent(
  loadScreen(() => import("../screens/about/about-screen.tsx")),
  "AboutScreen",
);

export function aboutRoutes(root: AnyRoute): readonly AnyRoute[] {
  return [
    createRoute({
      getParentRoute: () => root,
      path: "/about",
      component: AboutScreen,
      errorComponent: ScreenProblem,
    }),
  ];
}
