// The Board route: `/p/$projectId/board`, optionally filtered by `?season=<seasonId>`.
import {
  createRoute,
  lazyRouteComponent,
  redirect,
  stripSearchParams,
} from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { loadScreen } from "../router.tsx";
import { routeConfirmMe } from "../services/api-cache.ts";
import { chooseUrl, confirmPerson } from "../session.ts";
import type { AppRouterDeps } from "./index.ts";
import { ScreenProblem } from "./screen-problem.ts";

const BoardScreen = lazyRouteComponent(
  loadScreen(() => import("../screens/board/board-screen.tsx")),
  "BoardScreen",
);

export function boardRoutes(
  root: AnyRoute,
  deps: AppRouterDeps,
): readonly AnyRoute[] {
  const { api, usePerson } = deps;
  return [
    createRoute({
      getParentRoute: () => root,
      path: "/p/$projectId/board",
      validateSearch: (
        search: Record<string, unknown>,
      ): { season: string | null } => ({
        season:
          typeof search.season === "string" && search.season.length > 0
            ? search.season
            : null,
      }),
      search: { middlewares: [stripSearchParams({ season: null })] },
      beforeLoad: async ({ location }) => {
        const { person, setPerson } = usePerson.getState();
        if (
          (await confirmPerson(person, () =>
            routeConfirmMe(api, person?.token ?? null),
          )) !== null
        )
          return;
        setPerson(null);
        throw redirect({ href: chooseUrl(location.href), replace: true });
      },
      component: BoardScreen,
      errorComponent: ScreenProblem,
    }),
  ];
}
