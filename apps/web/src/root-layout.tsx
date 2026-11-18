// The frame every screen sits in: the demo bar, the screen and the Tour.

import { TOUR } from "@manent/demo";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import type { Api } from "./api.ts";
import { DemoBar } from "./demo/demo-bar.tsx";
import { TourPanel } from "./demo/tour-panel.tsx";
import { useDemo } from "./demo/use-demo.ts";
import type { PersonStore } from "./person-store.ts";
import { chooseUrl, personLabel } from "./session.ts";

export function RootLayout(props: {
  api: Api;
  fetch: typeof fetch;
  usePerson: PersonStore;
}) {
  const person = props.usePerson((s) => s.person);
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const { demo, control } = useDemo({ api: props.api, fetch: props.fetch });

  const openChooser = () => {
    if (location.pathname === "/choose") return;
    void navigate({ href: chooseUrl(location.href) });
  };

  return (
    <div className="flex min-h-screen flex-col bg-chrome text-fg">
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
        {demo && person && <TourPanel tour={TOUR} />}
      </div>
    </div>
  );
}
