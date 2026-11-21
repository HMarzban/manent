// The app's routes, defined in code.

import { SECTION_IDS } from "@manent/settings";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  stripSearchParams,
} from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import type { Api } from "./api.ts";
import { preloadDemoBarControls } from "./demo/demo-bar.tsx";
import { RootLayout } from "./root-layout.tsx";
import { SEND_FORM_IDS } from "./screens/send/form-ids.ts";
import { chooseUrl, choosePerson, confirmPerson, safeNext } from "./session.ts";
import { preloadShellPalette } from "./shell/app-shell.tsx";
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

const ChooseScreen = lazyRouteComponent(
  loadScreen(() => import("./screens/choose.tsx")),
  "ChooseScreen",
);
const LibraryScreen = lazyRouteComponent(
  loadScreen(() => import("./screens/library/library-screen.tsx")),
  "LibraryScreen",
);
const DocumentScreen = lazyRouteComponent(
  loadScreen(() => import("./screens/document/document-screen.tsx")),
  "DocumentScreen",
);
const SendScreen = lazyRouteComponent(
  loadScreen(() => import("./screens/send/send-screen.tsx")),
  "SendScreen",
);
const PreferencesScreen = lazyRouteComponent(
  loadScreen(() => import("./screens/preferences/preferences-screen.tsx")),
  "PreferencesScreen",
);
const StatesScreen = lazyRouteComponent(
  loadScreen(() => import("./screens/states/states-screen.tsx")),
  "StatesScreen",
);
const StandInScreen = lazyRouteComponent(
  loadScreen(() => import("./screens/states/stand-in-screen.tsx")),
  "StandInScreen",
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

  const rootRoute = createRootRoute({
    // `?person=<id>` chooses that person for this tab, then the parameter is dropped either way. Without it, every
    // screen but the chooser is a person's: a tab with none is asked who it is, then comes back to the address.
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
      params.delete("person");
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
      return <LibraryScreen api={api} person={person} />;
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

  const statesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/__states",
    component: StatesScreen,
    errorComponent: ScreenProblem,
  });

  const standInRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/__stand-in",
    component: StandInScreen,
    errorComponent: ScreenProblem,
  });

  return createRouter({
    routeTree: rootRoute.addChildren([
      libraryRoute,
      documentRoute,
      sendRoute,
      preferencesRoute,
      paneRoute,
      chooseRoute,
      // the test build serves the development screens
      ...(typeof MANENT_FLAVOUR !== "undefined" && MANENT_FLAVOUR === "test"
        ? [statesRoute, standInRoute]
        : []),
    ]),
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
  });
}
