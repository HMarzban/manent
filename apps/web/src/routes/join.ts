// A share link, `/join/$token`: after Choose who you are, the link gives the person its role and opens its document.
import {
  createRoute,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { createElement } from "react";
import { loadScreen } from "../router.tsx";
import { chooseUrl } from "../session.ts";
import type { JoinOutcome } from "../sharing/join-screen.tsx";
import type { AppRouterDeps } from "./index.ts";
import { ScreenProblem } from "./screen-problem.ts";

const JoinScreen = lazyRouteComponent(
  loadScreen(() => import("../sharing/join-screen.tsx")),
  "JoinScreen",
);
// the requests load apart from the entry, with the screen
const loadRequests = loadScreen(() => import("../sharing/share-requests.ts"));

export function joinRoutes(
  root: AnyRoute,
  deps: AppRouterDeps,
): readonly AnyRoute[] {
  const { usePerson } = deps;
  const token = (): string | null => usePerson.getState().person?.token ?? null;
  const joinRoute = createRoute({
    getParentRoute: () => root,
    path: "/join/$token",
    // only a person with a session can hold a role, so a tab without one is asked who it is first
    beforeLoad: ({ location }) => {
      if (token() !== null) return;
      throw redirect({ href: chooseUrl(location.href), replace: true });
    },
    loader: async ({ params, location }): Promise<JoinOutcome> => {
      const { createShareRequests } = await loadRequests();
      const answer = await createShareRequests({
        fetch: deps.fetch,
        token,
      }).join(params.token);
      if (answer.ok) return { ok: true, joined: answer.value };
      switch (answer.code) {
        case "link_expired":
          return { ok: false, reason: "link_expired" };
        // a link the server cannot read or find, or whose document is gone, no longer works either
        case "link_revoked":
        case "bad_request":
        case "not_found":
        case "deleted":
          return { ok: false, reason: "link_revoked" };
        case "unauthenticated":
          throw redirect({ href: chooseUrl(location.href), replace: true });
        case "forbidden":
        case "not_member":
        case "unreachable":
        case "refused":
          throw new Error(`a share link was not opened: ${answer.code}`);
      }
    },
    component: function Join() {
      return createElement(JoinScreen, { outcome: joinRoute.useLoaderData() });
    },
    errorComponent: ScreenProblem,
  });
  return [joinRoute];
}
