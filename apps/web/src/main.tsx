import { createValue } from "@manent/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createApi } from "./api.ts";
import { readNavigator } from "./platform.ts";
import { createAppRouter } from "./router.tsx";
import { EnvironmentProvider } from "./services/context.tsx";
import { browserStorage } from "./services/local-map.ts";
import { INITIAL_SHELL_STATE } from "./services/ports.ts";
import type { Environment, ShellState } from "./services/ports.ts";
import { tabStorage } from "./session.ts";
import { createShellDom } from "./shell/regions.tsx";
import { bindGuard, createGuard } from "./state/guard.ts";
import { createPersonStore } from "./state/person.store.ts";

// the build's define; absent outside a build
declare const MANENT_FLAVOUR: string | undefined;

const root = document.getElementById("root");
if (root === null) throw new Error("the page has no #root element");

const flavour =
  typeof MANENT_FLAVOUR !== "undefined" && MANENT_FLAVOUR === "test"
    ? "test"
    : "production";
const guard = createGuard({ flavour });
bindGuard(guard);
const now = (): number => Date.now();
// a preference changed in another tab waits for a pause in the typing here
let lastKeyAt: number | null = null;
window.addEventListener(
  "keydown",
  () => {
    lastKeyAt = now();
  },
  { capture: true },
);
// the end-to-end tests read the guard's count and every command that ran
const runs: string[] = [];
if (flavour === "test") Reflect.set(window, "__manent", { guard, runs });

const { where, language } = readNavigator();
const origin = browserStorage(window);
const environment: Environment = {
  where,
  language,
  now,
  schedule(fn, delayMs) {
    const timer = setTimeout(fn, delayMs);
    return () => clearTimeout(timer);
  },
  frame(fn) {
    const id = requestAnimationFrame(fn);
    return () => cancelAnimationFrame(id);
  },
  storage: origin.storage,
  storageEvents: origin.events,
  tabStorage: tabStorage(),
  randomId: () => crypto.randomUUID(),
  lastKeyAt: () => lastKeyAt,
  guard,
  flavour,
  shellState: createValue<ShellState>(INITIAL_SHELL_STATE),
  dom: createShellDom(document),
  online: () => navigator.onLine,
  ran: (commandId) => {
    if (flavour === "test") runs.push(commandId);
  },
  visitUndo: { current: null },
};

const usePerson = createPersonStore(tabStorage());
const api = createApi({
  fetch,
  getToken: () => usePerson.getState().person?.token ?? null,
});
const router = createAppRouter({ api, fetch, usePerson });
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

createRoot(root).render(
  <StrictMode>
    <EnvironmentProvider environment={environment}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </EnvironmentProvider>
  </StrictMode>,
);
