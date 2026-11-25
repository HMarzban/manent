// Preferences: `/preferences` and `/preferences/$pane`.
import { SECTION_IDS } from "@manent/settings";
import {
  createRoute,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { createElement } from "react";
import type { ReactNode } from "react";
import { OncePreferencesRead, loadScreen } from "../router.tsx";
import { safeNext } from "../session.ts";
import { ScreenProblem } from "./screen-problem.ts";

/** Preferences at its first pane, keeping the search (Back's `from`). */
const toFirstPane = (searchStr: string) =>
  redirect({ href: `/preferences/writing${searchStr}`, replace: true });

const PreferencesScreen = lazyRouteComponent(
  loadScreen(async () => {
    const { PreferencesScreen: Screen } =
      await import("../screens/preferences/preferences-screen.tsx");
    return {
      PreferencesScreen: (): ReactNode =>
        createElement(OncePreferencesRead, {
          children: createElement(Screen),
        }),
    };
  }),
  "PreferencesScreen",
);

export function preferencesRoutes(root: AnyRoute): readonly AnyRoute[] {
  const preferencesRoute = createRoute({
    getParentRoute: () => root,
    path: "/preferences",
    beforeLoad: ({ location }) => {
      throw toFirstPane(location.searchStr);
    },
  });

  const paneRoute = createRoute({
    getParentRoute: () => root,
    path: "/preferences/$pane",
    // where Back returns to: a path inside the app
    validateSearch: (search: Record<string, unknown>): { from: string } => ({
      from: safeNext(typeof search.from === "string" ? search.from : null),
    }),
    beforeLoad: ({ params, location }) => {
      if (SECTION_IDS.some((id) => id === params.pane)) return;
      throw toFirstPane(location.searchStr);
    },
    component: PreferencesScreen,
    errorComponent: ScreenProblem,
  });

  return [preferencesRoute, paneRoute];
}
