// The Library and the chooser: `/` and `/choose`.
import {
  createRoute,
  lazyRouteComponent,
  redirect,
  stripSearchParams,
  useNavigate,
} from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { Fragment, createElement, useEffect } from "react";
import type { MeResult } from "../api.ts";
import { firstRunPath, loadScreen } from "../router.tsx";
import { CONTINUE_VIEW_ID } from "../screens/library/library-address.ts";
import { isLibraryViewId } from "../screens/library/view-ids.ts";
import { routeConfirmMe } from "../services/api-cache.ts";
import { useServices } from "../services/context.tsx";
import type { PersonServices } from "../services/ports.ts";
import { chooseUrl, confirmPerson, safeNext } from "../session.ts";
import type { AppRouterDeps } from "./index.ts";
import { ScreenProblem } from "./screen-problem.ts";

// each person's services whose first run has been opened
const openedFirstRuns = new WeakSet<PersonServices>();

/** A first launch opens a blank page 1. */
function FirstRun(): null {
  const services = useServices();
  const navigate = useNavigate();
  useEffect(() => {
    let shown = true;
    void firstRunPath(services).then((path) => {
      if (!shown || path === null || openedFirstRuns.has(services)) return;
      openedFirstRuns.add(services);
      // never awaited: a blocker may stop it, and then it never settles
      void navigate({ href: path, replace: true });
    });
    return () => {
      shown = false;
    };
  }, [services, navigate]);
  return null;
}

const BOOT_CONFIRM_TIMEOUT_MS = 2_500;

function raceBootTimeout(
  pending: Promise<MeResult>,
  timeoutMs: number,
): Promise<MeResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timedOut = new Promise<MeResult>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, reason: "unreachable" }),
      timeoutMs,
    );
  });
  return Promise.race([
    pending.finally(() => {
      if (timer !== null) clearTimeout(timer);
    }),
    timedOut,
  ]);
}

const ChooseScreen = lazyRouteComponent(
  loadScreen(() => import("../screens/choose.tsx")),
  "ChooseScreen",
);
const LibraryScreen = lazyRouteComponent(
  loadScreen(() => import("../screens/library/library-screen.tsx")),
  "LibraryScreen",
);

export function libraryRoutes(
  root: AnyRoute,
  deps: AppRouterDeps,
): readonly AnyRoute[] {
  const { api, usePerson } = deps;
  const libraryRoute = createRoute({
    getParentRoute: () => root,
    path: "/",
    // the workspace shown, null for the person's first; the view named, Continue when the address names none of the
    // list's `view` entries; the folder shown; the search, which chooses its own view
    validateSearch: (
      search: Record<string, unknown>,
    ): {
      w: string | null;
      view: string;
      folder: string | null;
      q: string | null;
    } => ({
      w: typeof search.w === "string" ? search.w : null,
      view: isLibraryViewId(search.view) ? search.view : CONTINUE_VIEW_ID,
      folder: typeof search.folder === "string" ? search.folder : null,
      q: typeof search.q === "string" ? search.q : null,
    }),
    // so an address never says w=null, view=continue, folder=null or q=null
    search: {
      middlewares: [
        stripSearchParams({
          w: null,
          view: CONTINUE_VIEW_ID,
          folder: null,
          q: null,
        }),
      ],
    },
    beforeLoad: async ({ location }) => {
      const { person, setPerson } = usePerson.getState();
      if (
        (await confirmPerson(person, () =>
          raceBootTimeout(
            routeConfirmMe(api, person?.token ?? null),
            BOOT_CONFIRM_TIMEOUT_MS,
          ),
        )) !== null
      )
        return;
      setPerson(null);
      throw redirect({ href: chooseUrl(location.href), replace: true });
    },
    component: function Library() {
      const person = usePerson((s) => s.person);
      return createElement(
        Fragment,
        null,
        person !== null && person.token === null
          ? createElement(FirstRun)
          : null,
        createElement(LibraryScreen, { api, person }),
      );
    },
    errorComponent: ScreenProblem,
  });

  const chooseRoute = createRoute({
    getParentRoute: () => root,
    path: "/choose",
    validateSearch: (search: Record<string, unknown>): { next: string } => ({
      next: safeNext(typeof search.next === "string" ? search.next : null),
    }),
    component: function Choose() {
      const { next } = chooseRoute.useSearch();
      const person = usePerson((s) => s.person);
      const setPerson = usePerson((s) => s.setPerson);
      return createElement(ChooseScreen, { api, person, setPerson, next });
    },
    errorComponent: ScreenProblem,
  });

  return [libraryRoute, chooseRoute];
}
