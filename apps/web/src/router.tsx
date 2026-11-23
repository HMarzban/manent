// The app's routes, defined in code: the root route here, and each group of screens in `routes/`.

import { PANEL_IDS } from "@manent/commands";
import {
  createRootRoute,
  createRouter,
  redirect,
  useBlocker,
} from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { preloadDemoBarControls } from "./demo/demo-bar.tsx";
import { RootLayout } from "./root-layout.tsx";
import { ROUTE_GROUPS } from "./routes/index.ts";
import type { AppRouterDeps } from "./routes/index.ts";
import { ScreenProblem } from "./routes/screen-problem.ts";
import { SEND_FORM_IDS, sendPath } from "./screens/send/form-ids.ts";
import { useServices } from "./services/context.tsx";
import type { PersonServices } from "./services/ports.ts";
import { chooseUrl, choosePerson } from "./session.ts";
import { preloadShellPalette } from "./shell/app-shell.tsx";
import { panelsActions } from "./state/panels.store.ts";

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

// one first run per person's services, however often the Library is drawn
const firstRuns = new WeakMap<PersonServices, Promise<string | null>>();

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

export function createAppRouter(deps: AppRouterDeps): AnyRouter {
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

  const router = createRouter({
    routeTree: rootRoute.addChildren(
      ROUTE_GROUPS.flatMap((group) => group(rootRoute, deps)),
    ),
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
