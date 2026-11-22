// The app's routes, defined in code.

import { PANEL_IDS } from "@manent/commands";
import { SECTION_IDS } from "@manent/settings";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  stripSearchParams,
  useBlocker,
  useNavigate,
} from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Api } from "./api.ts";
import { preloadDemoBarControls } from "./demo/demo-bar.tsx";
import { RootLayout } from "./root-layout.tsx";
import { SEND_FORM_IDS, sendPath } from "./screens/send/form-ids.ts";
import { useServices } from "./services/context.tsx";
import type { PersonServices } from "./services/ports.ts";
import { chooseUrl, choosePerson, confirmPerson, safeNext } from "./session.ts";
import { preloadShellPalette } from "./shell/app-shell.tsx";
import { panelsActions } from "./state/panels.store.ts";
import type { PersonStore } from "./state/person.store.ts";

// the build's define; absent outside a build
declare const MANENT_FLAVOUR: string | undefined;

/** Preferences at its first pane, keeping the search (Back's `from`). */
const toFirstPane = (searchStr: string) =>
  redirect({ href: `/preferences/writing${searchStr}`, replace: true });

/** `importer`, except that a load failing after the page has begun to leave never settles: a navigation cancels the pending load, and the router would take that failure for a newer build and reload the page, cancelling the navigation. */
export function loadScreen<T>(importer: () => Promise<T>): () => Promise<T> {
  return async () => {
    let leaving = false;
    const leave = () => {
      leaving = true;
    };
    window.addEventListener("beforeunload", leave);
    try {
      return await importer();
    } catch (cause) {
      if (leaving) return new Promise<T>(() => {});
      // unchanged, so the router still reloads the page for a newer build
      throw cause;
    } finally {
      window.removeEventListener("beforeunload", leave);
    }
  };
}

// one first run per person's services, however often the Library is drawn, and opened once
const firstRuns = new WeakMap<PersonServices, Promise<string | null>>();
const openedFirstRuns = new WeakSet<PersonServices>();

/**
 * For a person with no session whose own workspace holds no project, once its index has been read from the device: the
 * address of a new film's blank first page, made once. Null otherwise.
 */
export function firstRunPath(services: PersonServices): Promise<string | null> {
  const known = firstRuns.get(services);
  if (known !== undefined) return known;
  const own = services.userId;
  const made = services.library.readProjects(own).then(async (projects) => {
    if (projects.length > 0) return null;
    const { docId } = await services.library.createProject(own, "film");
    return `/s/${docId}`;
  });
  firstRuns.set(services, made);
  return made;
}

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

// each services' `ready` once it has settled, so that a later visit draws Preferences at once
const settled = new WeakSet<Promise<void>>();

/**
 * Draws `children` once the person's preferences have been read from the device, so no control shows a value they do
 * not hold. It waits without a Suspense boundary, whose reveal React holds back for up to 300 ms.
 */
export function OncePreferencesRead(props: { children: ReactNode }): ReactNode {
  const { ready } = useServices();
  // the services whose `ready` this screen has seen settle: another person's services wait again
  const [seen, setSeen] = useState<Promise<void> | null>(null);
  useEffect(() => {
    let mounted = true;
    void ready.then(() => {
      settled.add(ready);
      if (mounted) setSeen(ready);
    });
    return () => {
      mounted = false;
    };
  }, [ready]);
  return settled.has(ready) || seen === ready ? props.children : null;
}

const ChooseScreen = lazyRouteComponent(
  loadScreen(() => import("./screens/choose.tsx")),
  "ChooseScreen",
);
const LibraryScreen = lazyRouteComponent(
  loadScreen(() => import("./screens/library/library-screen.tsx")),
  "LibraryScreen",
);
/**
 * Leaving a document this device cannot save asks first, though never for that document's own Send screen. Nothing
 * awaits a navigation this stops: its promise never settles.
 */
export function CloseBlocker(): null {
  const { guard } = useServices().closing;
  useBlocker({
    shouldBlockFn: async ({ next }) => {
      const failing = guard.failing();
      if (failing === null) return false;
      const ownSend = (form: (typeof SEND_FORM_IDS)[number]) =>
        next.pathname === sendPath(failing.docId, form);
      if (SEND_FORM_IDS.some(ownSend)) return false;
      return (await guard.ask()) !== "leave";
    },
    enableBeforeUnload: false,
  });
  return null;
}

const DocumentScreen = lazyRouteComponent(
  loadScreen(async () => {
    const [{ DocumentScreen: Screen }, { CloseQuestion }] = await Promise.all([
      import("./screens/document/document-screen.tsx"),
      import("./services/sync/close-question.tsx"),
    ]);
    return {
      DocumentScreen: (): ReactNode => (
        <>
          <Screen />
          <CloseBlocker />
          <CloseQuestion />
        </>
      ),
    };
  }),
  "DocumentScreen",
);
const SendScreen = lazyRouteComponent(
  loadScreen(() => import("./screens/send/send-screen.tsx")),
  "SendScreen",
);
const PreferencesScreen = lazyRouteComponent(
  loadScreen(async () => {
    const { PreferencesScreen: Screen } =
      await import("./screens/preferences/preferences-screen.tsx");
    return {
      PreferencesScreen: (): ReactNode => (
        <OncePreferencesRead>
          <Screen />
        </OncePreferencesRead>
      ),
    };
  }),
  "PreferencesScreen",
);
// apart from the entry, whose size budget its stock button would break
const ScreenProblem = lazyRouteComponent(
  () => import("./shell/screen-problem.tsx"),
  "ScreenProblem",
);

export function createAppRouter(deps: {
  api: Api;
  fetch: typeof fetch;
  usePerson: PersonStore;
}): AnyRouter {
  const { api, usePerson } = deps;
  // the code the frame draws apart from the entry, fetched while the server that served the page still answers
  void ScreenProblem.preload?.();
  preloadDemoBarControls();
  preloadShellPalette();

  // set by `?panels=closed` until the screen it opens has been drawn
  let closingPanels = false;
  const rootRoute = createRootRoute({
    // `?person=<id>` chooses that person for this tab, and `?panels=closed` beside it closes both panels once the screen
    // is drawn (a window the Tour opens beside another); both are then dropped. Without `?person=`, every screen but the
    // chooser is a person's: a tab with none is asked who it is, then comes back to the address.
    beforeLoad: async ({ location, matches }) => {
      const params = new URLSearchParams(location.searchStr);
      const userId = params.get("person");
      if (userId === null) {
        const choosing = matches.some((m) => m.routeId === "/choose");
        if (choosing || usePerson.getState().person !== null) return;
        throw redirect({ href: chooseUrl(location.href), replace: true });
      }
      // a server that cannot be reached leaves the tab who it was
      const choices = await api.choices().catch(() => []);
      const choice = choices.find((c) => c.userId === userId);
      const result = choice ? await choosePerson(choice, api) : null;
      if (result?.ok) usePerson.getState().setPerson(result.person);
      closingPanels = params.get("panels") === "closed";
      params.delete("person");
      params.delete("panels");
      const search = params.toString();
      const hash = location.hash ? `#${location.hash}` : "";
      throw redirect({
        href: `${location.pathname}${search ? `?${search}` : ""}${hash}`,
        replace: true,
      });
    },
    component: function Root() {
      return <RootLayout {...deps} />;
    },
  });

  const libraryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    // the workspace shown; null is the person's first
    validateSearch: (
      search: Record<string, unknown>,
    ): { w: string | null } => ({
      w: typeof search.w === "string" ? search.w : null,
    }),
    // so an address never says w=null
    search: { middlewares: [stripSearchParams({ w: null })] },
    beforeLoad: async ({ location }) => {
      const { person, setPerson } = usePerson.getState();
      if ((await confirmPerson(person, api.me)) !== null) return;
      setPerson(null);
      throw redirect({ href: chooseUrl(location.href), replace: true });
    },
    component: function Library() {
      const person = usePerson((s) => s.person);
      return (
        <>
          {person !== null && person.token === null ? <FirstRun /> : null}
          <LibraryScreen api={api} person={person} />
        </>
      );
    },
    errorComponent: ScreenProblem,
  });

  const chooseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/choose",
    validateSearch: (search: Record<string, unknown>): { next: string } => ({
      next: safeNext(typeof search.next === "string" ? search.next : null),
    }),
    component: function Choose() {
      const { next } = chooseRoute.useSearch();
      const person = usePerson((s) => s.person);
      const setPerson = usePerson((s) => s.setPerson);
      return (
        <ChooseScreen
          api={api}
          person={person}
          setPerson={setPerson}
          next={next}
        />
      );
    },
    errorComponent: ScreenProblem,
  });

  const documentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/s/$docId",
    component: DocumentScreen,
    errorComponent: ScreenProblem,
  });

  const sendRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/s/$docId/send/$form",
    beforeLoad: ({ params }) => {
      if (SEND_FORM_IDS.some((id) => id === params.form)) return;
      throw redirect({
        to: "/s/$docId",
        params: { docId: params.docId },
        replace: true,
      });
    },
    component: SendScreen,
    errorComponent: ScreenProblem,
  });

  const preferencesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/preferences",
    beforeLoad: ({ location }) => {
      throw toFirstPane(location.searchStr);
    },
  });

  const paneRoute = createRoute({
    getParentRoute: () => rootRoute,
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

  // the test build serves the development screens; any other build holds none of their code
  const developmentRoutes =
    typeof MANENT_FLAVOUR !== "undefined" && MANENT_FLAVOUR === "test"
      ? [
          createRoute({
            getParentRoute: () => rootRoute,
            path: "/__states",
            component: lazyRouteComponent(
              loadScreen(() => import("./screens/states/states-screen.tsx")),
              "StatesScreen",
            ),
            errorComponent: ScreenProblem,
          }),
          createRoute({
            getParentRoute: () => rootRoute,
            path: "/__stand-in",
            component: lazyRouteComponent(
              loadScreen(() => import("./screens/states/stand-in-screen.tsx")),
              "StandInScreen",
            ),
            errorComponent: ScreenProblem,
          }),
        ]
      : [];

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      libraryRoute,
      documentRoute,
      sendRoute,
      preferencesRoute,
      paneRoute,
      chooseRoute,
      ...developmentRoutes,
    ]),
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
  });
  // after the draw, which has put back the panels the person left open
  router.subscribe("onRendered", () => {
    if (!closingPanels) return;
    closingPanels = false;
    for (const panel of PANEL_IDS) panelsActions.close(panel);
  });
  return router;
}
