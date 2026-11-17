// The app's routes, defined in code.

import type { TourFile } from "@manent/testkit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { createServerControl } from "./api.ts";
import type { Api } from "./api.ts";
import { DemoBar, POLL_MS } from "./demo/demo-bar.tsx";
import { TourPanel } from "./demo/tour-panel.tsx";
import tourData from "./demo/tour.json";
import { ChooseScreen } from "./screens/choose.tsx";
import { LibraryScreen } from "./screens/library.tsx";
import { chooseUrl, personLabel, startScreen } from "./session.ts";
import type { TabPerson, createTabSession } from "./session.ts";

const tour = tourData as TourFile;

interface PersonState {
  person: TabPerson | null;
  setPerson(person: TabPerson | null): void;
}

/** The tab's person: one store over the tab's session. */
export function createPersonStore(
  session: ReturnType<typeof createTabSession>,
) {
  return create<PersonState>((set) => ({
    person: session.get(),
    setPerson(person) {
      session.set(person);
      set({ person });
    },
  }));
}

export type PersonStore = ReturnType<typeof createPersonStore>;

export function createAppRouter(deps: {
  api: Api;
  fetchFn: typeof fetch;
  usePerson: PersonStore;
}) {
  const { api, fetchFn, usePerson } = deps;

  function RootLayout() {
    const person = usePerson((s) => s.person);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const location = useRouterState({ select: (s) => s.location });

    const demo = useQuery({
      queryKey: ["demo"],
      queryFn: api.demo,
      refetchInterval: POLL_MS,
      refetchOnWindowFocus: true,
    }).data;

    // Someone reset the demo: nothing cached before it still holds.
    const seenSeed = useRef<string | null | undefined>(undefined);
    const seedId = demo?.seedId;
    useEffect(() => {
      if (seedId === undefined) return;
      if (seenSeed.current !== undefined && seenSeed.current !== seedId)
        void queryClient.resetQueries();
      seenSeed.current = seedId;
    }, [seedId, queryClient]);

    const controlUrl = demo?.control?.url;
    const controlToken = demo?.control?.token;
    const control = useMemo(
      () =>
        controlUrl && controlToken
          ? {
              id: controlUrl,
              client: createServerControl(fetchFn, {
                url: controlUrl,
                token: controlToken,
              }),
            }
          : null,
      [controlUrl, controlToken],
    );

    const openChooser = () => {
      if (location.pathname === "/choose") return;
      void navigate({ href: chooseUrl(location.href) });
    };

    return (
      <div className="flex min-h-screen flex-col bg-white text-neutral-900">
        {demo && (
          <DemoBar
            personLabel={personLabel(person)}
            onPersonClick={openChooser}
            control={control}
          />
        )}
        <div className="flex flex-1">
          <main className="flex-1">
            <Outlet />
          </main>
          {demo && person && <TourPanel tour={tour} />}
        </div>
      </div>
    );
  }

  const rootRoute = createRootRoute({
    // `?person=<id>` signs this tab in, then the parameter is dropped either way.
    beforeLoad: async ({ location }) => {
      const params = new URLSearchParams(location.searchStr);
      const personId = params.get("person");
      if (personId === null) return;
      const result = await api.signIn(personId);
      if (result.status === "ok") usePerson.getState().setPerson(result.person);
      params.delete("person");
      const search = params.toString();
      const hash = location.hash ? `#${location.hash}` : "";
      throw redirect({
        href: `${location.pathname}${search ? `?${search}` : ""}${hash}`,
        replace: true,
      });
    },
    component: RootLayout,
  });

  const libraryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    beforeLoad: async ({ location }) => {
      const { person, setPerson } = usePerson.getState();
      const me = person ? (await api.me()).status : "unknown";
      if (me === "unauthenticated") setPerson(null);
      if (startScreen(person, me) === "choose")
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
    validateSearch: (search: Record<string, unknown>): { next?: string } =>
      typeof search.next === "string" ? { next: search.next } : {},
    component: function Choose() {
      const { next } = chooseRoute.useSearch();
      const person = usePerson((s) => s.person);
      const setPerson = usePerson((s) => s.setPerson);
      return (
        <ChooseScreen
          api={api}
          person={person}
          setPerson={setPerson}
          next={next ?? null}
        />
      );
    },
  });

  return createRouter({
    routeTree: rootRoute.addChildren([libraryRoute, chooseRoute]),
  });
}
