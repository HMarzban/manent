// The frame every screen sits in: the person's services around the shell, the demo bar and the screen.

import type { TrustEvent } from "@manent/ui";
import { Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import type { Api } from "./api.ts";
import { DemoBar } from "./demo/demo-bar.tsx";
import { ResettingScreen, useResetting } from "./demo/resetting-screen.tsx";
import { useDemo, useServerState } from "./demo/use-demo.ts";
import type { Navigation } from "./handlers/index.ts";
import { ServicesProvider, usePersonServices } from "./services/context.tsx";
import { chooseUrl } from "./session.ts";
import { AppShell, ScreenArea, useShellScreen } from "./shell/app-shell.tsx";
import { ShellRegion } from "./shell/regions.tsx";
import type { PersonStore } from "./state/person.store.ts";

// why a control or a key did nothing belongs to the screen it was pressed on, and leaves with it
const SCREEN_REASON: TrustEvent["kind"] = "command_unavailable";

/**
 * Until a person is chosen there are no services, so the screen (Choose who you are) is drawn without the shell; nor is
 * there a shell while the demo resets, when nothing in it could act.
 */
export function RootLayout(props: {
  api: Api;
  fetch: typeof fetch;
  usePerson: PersonStore;
}): ReactNode {
  const { api, usePerson } = props;
  const person = usePerson((s) => s.person);
  const router = useRouter();
  const location = useRouterState({ select: (s) => s.location });
  const { demo, control } = useDemo({ api, fetch: props.fetch });
  const resetting = useResetting(useServerState(control), demo?.seedId ?? null);
  const bare = useShellScreen().page === "bare";
  const navigation = useMemo(
    (): Navigation => ({
      navigate(href) {
        void router.navigate({ href });
      },
      here() {
        const { location: at, matches } = router.state;
        return {
          routeId: matches.at(-1)?.routeId ?? null,
          href: at.href,
          search: at.search,
        };
      },
    }),
    [router],
  );
  const services = usePersonServices({
    person,
    demo: demo !== null,
    api,
    usePerson,
    router: navigation,
  });

  useEffect(
    () =>
      router.subscribe("onBeforeNavigate", (event) => {
        if (event.pathChanged) services?.messages.withdraw(SCREEN_REASON);
      }),
    [router, services],
  );

  const openChooser = () => {
    if (location.pathname === "/choose") return;
    navigation.navigate(chooseUrl(location.href));
  };
  const demoBar = demo !== null && (!bare || resetting) && (
    <DemoBar
      person={person}
      onPersonClick={openChooser}
      control={control}
      resetting={resetting}
    />
  );

  if (services === null || resetting)
    return (
      <div className="flex min-h-screen flex-col bg-chrome text-fg">
        {demoBar}
        <main className="flex-1">
          {resetting ? <ResettingScreen /> : <Outlet />}
        </main>
      </div>
    );
  return (
    <ServicesProvider services={services}>
      <AppShell>
        {demoBar && <ShellRegion region="demo_bar">{demoBar}</ShellRegion>}
        <ScreenArea>
          <Outlet />
        </ScreenArea>
      </AppShell>
    </ServicesProvider>
  );
}
