// The app's routes, defined in code.

import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import type { Api } from "./api.ts";
import type { PersonStore } from "./person-store.ts";
import { RootLayout } from "./root-layout.tsx";
import { ChooseScreen } from "./screens/choose.tsx";
import { LibraryScreen } from "./screens/library.tsx";
import { chooseUrl, choosePerson, confirmPerson, safeNext } from "./session.ts";

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

  return createRouter({
    routeTree: rootRoute.addChildren([libraryRoute, chooseRoute]),
  });
}
