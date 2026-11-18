// The frame every screen sits in: the person's services around the shell, the demo bar and the screen.

import { Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import type { ReactNode } from "react";
import type { Api } from "./api.ts";
import { DemoBar } from "./demo/demo-bar.tsx";
import { useDemo } from "./demo/use-demo.ts";
import type { Navigation } from "./handlers/index.ts";
import { ServicesProvider, usePersonServices } from "./services/context.tsx";
import { chooseUrl, personLabel } from "./session.ts";
import { AppShell, ScreenArea } from "./shell/app-shell.tsx";
import { ShellRegion } from "./shell/regions.tsx";
import type { PersonStore } from "./state/person.store.ts";

/** Until a person is chosen there are no services, so the screen (Choose who you are) is drawn without the shell. */
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

  const openChooser = () => {
    if (location.pathname === "/choose") return;
    navigation.navigate(chooseUrl(location.href));
  };
  const demoBar = demo !== null && (
    <DemoBar
      personLabel={personLabel(person)}
      onPersonClick={openChooser}
      control={control}
    />
  );

  if (services === null)
    return (
      <div className="flex min-h-screen flex-col bg-chrome text-fg">
        {demoBar}
        <main className="flex-1">
          <Outlet />
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
