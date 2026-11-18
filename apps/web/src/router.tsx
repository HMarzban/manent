// The app's routes, defined in code.

import { SECTION_IDS } from "@manent/settings";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import type { Api } from "./api.ts";
import type { PersonStore } from "./person-store.ts";
import { RootLayout } from "./root-layout.tsx";
import { ChooseScreen } from "./screens/choose.tsx";
import { SEND_FORM_IDS } from "./screens/send/forms.ts";
import { chooseUrl, choosePerson, confirmPerson, safeNext } from "./session.ts";

// true only in the test build, which serves the development screens
const TEST_FLAVOUR: boolean = false;

/** Preferences at its first pane, keeping the search (Back's `from`). */
const toFirstPane = (searchStr: string) =>
  redirect({ href: `/preferences/writing${searchStr}`, replace: true });

const LibraryScreen = lazyRouteComponent(
  () => import("./screens/library/library-screen.tsx"),
  "LibraryScreen",
);
const DocumentScreen = lazyRouteComponent(
  () => import("./screens/document/document-screen.tsx"),
  "DocumentScreen",
);
const SendScreen = lazyRouteComponent(
  () => import("./screens/send/send-screen.tsx"),
  "SendScreen",
);
const PreferencesScreen = lazyRouteComponent(
  () => import("./screens/preferences/preferences-screen.tsx"),
  "PreferencesScreen",
);
const StatesScreen = lazyRouteComponent(
  () => import("./screens/states/states-screen.tsx"),
  "StatesScreen",
);
const StandInScreen = lazyRouteComponent(
  () => import("./screens/states/stand-in-screen.tsx"),
  "StandInScreen",
);

export function createAppRouter(deps: {
  api: Api;
  fetch: typeof fetch;
  usePerson: PersonStore;
}): AnyRouter {
  const { api, usePerson } = deps;

  const rootRoute = createRootRoute({
    // `?person=<id>` chooses that person for this tab, then the parameter is dropped either way.
    beforeLoad: async ({ location }) => {
      const params = new URLSearchParams(location.searchStr);
      const userId = params.get("person");
      if (userId === null) return;
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
    beforeLoad: async ({ location }) => {
      const { person, setPerson } = usePerson.getState();
      if ((await confirmPerson(person, api.me)) !== null) return;
      setPerson(null);
      throw redirect({ href: chooseUrl(location.href), replace: true });
    },
    component: function Library() {
      const name = usePerson((s) => s.person?.name ?? null);
      return <LibraryScreen personName={name} />;
    },
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
  });

  const documentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/s/$docId",
    component: function Document() {
      const { docId } = documentRoute.useParams();
      return <DocumentScreen docId={docId} />;
    },
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
    component: function Send() {
      const { docId, form } = sendRoute.useParams();
      return <SendScreen docId={docId} form={form} />;
    },
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
    component: function Preferences() {
      const { pane } = paneRoute.useParams();
      return <PreferencesScreen pane={pane} />;
    },
  });

  const statesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/__states",
    component: StatesScreen,
  });

  const standInRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/__stand-in",
    component: StandInScreen,
  });

  return createRouter({
    routeTree: rootRoute.addChildren([
      libraryRoute,
      documentRoute,
      sendRoute,
      preferencesRoute,
      paneRoute,
      chooseRoute,
      ...(TEST_FLAVOUR ? [statesRoute, standInRoute] : []),
    ]),
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
  });
}
