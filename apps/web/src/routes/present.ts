// The Present screen's windows: the room window at `/s/$docId/present` and the prompter window at `/s/$docId/prompter`.
import {
  createRoute,
  lazyRouteComponent,
  notFound,
} from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { loadScreen } from "../router.tsx";
import type { PresentMode } from "../screens/present/modes.ts";
import { PRESENT_PATHS } from "../screens/present/open-window.ts";
import { ScreenProblem } from "./screen-problem.ts";

const loadModes = loadScreen(() => import("../screens/present/modes.ts"));
const PresentScreen = lazyRouteComponent(
  loadScreen(() => import("../screens/present/present-screen.tsx")),
  "PresentScreen",
);

/** The window of mode `id`, which finds its mode by id: a mode not yet in PRESENT_MODES is not found. */
function presentRoute(root: AnyRoute, id: PresentMode["id"]): AnyRoute {
  return createRoute({
    getParentRoute: () => root,
    path: `/s/$docId/${PRESENT_PATHS[id]}`,
    loader: async (): Promise<PresentMode> => {
      const { PRESENT_MODES } = await loadModes();
      const mode = PRESENT_MODES.find((m) => m.id === id);
      if (mode === undefined) throw notFound();
      return mode;
    },
    component: PresentScreen,
    errorComponent: ScreenProblem,
  });
}

export function presentRoutes(root: AnyRoute): readonly AnyRoute[] {
  return [presentRoute(root, "room"), presentRoute(root, "prompter")];
}
