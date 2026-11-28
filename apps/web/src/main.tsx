import { markEnd, markStart, readMarks, setMarksEnabled } from "@manent/perf";
import type { UpdateState } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createApi } from "./api.ts";
import { createOfflineWarm } from "./boot/offline-warm.ts";
import { setActiveWebUpdate, startSwLifecycle } from "./boot/sw-lifecycle.ts";
import type {
  SwLifecycleHandle,
  WebUpdateController,
} from "./boot/sw-lifecycle.ts";
import { afterFirstFrame } from "./desktop/first-frame.ts";
import type { DesktopHost } from "./desktop/host.ts";
import { domXml } from "./import/dom-xml.ts";
import { readNavigator } from "./platform.ts";
import { createAppRouter } from "./router.tsx";
import { EnvironmentProvider } from "./services/context.tsx";
import { browserStorage } from "./services/local-map.ts";
import { INITIAL_SHELL_STATE } from "./services/ports.ts";
import type {
  Environment,
  PersonServices,
  ShellState,
} from "./services/ports.ts";
import {
  readCachedChoices,
  tabStorage,
  writeCachedChoices,
} from "./session.ts";
import { createShellDom } from "./shell/regions.tsx";
import { bindGuard, createGuard } from "./state/guard.ts";
import { createPersonStore } from "./state/person.store.ts";

// the build's define; absent outside a build
declare const MANENT_FLAVOUR: string | undefined;

const flavour =
  typeof MANENT_FLAVOUR !== "undefined" && MANENT_FLAVOUR === "test"
    ? "test"
    : "production";
// the test build times the interface from its first statement; -1 everywhere else, which records nothing
if (flavour === "test") setMarksEnabled(true);
const startedAt = markStart();

const root = document.getElementById("root");
if (root === null) throw new Error("the page has no #root element");

// the desktop app's node writes the shell's startup values into the page it serves; the web has none, and never loads
// what reads them. Desktop NEVER registers a web service worker.
const desktopGlobal: unknown = Reflect.get(window, "manentDesktop");

let swLifecycle: SwLifecycleHandle | null = null;
let startWebLifecycle: (() => SwLifecycleHandle) | null = null;
let pendingBuildId: string | null = null;

function notifyServerBuildId(buildId: string): void {
  if (desktopGlobal !== undefined) return;
  if (swLifecycle !== null) swLifecycle.notifyBuildId(buildId);
  else pendingBuildId = buildId;
}

function registerCurrentServiceWorker(): void {
  if (desktopGlobal !== undefined) return;
  startWebLifecycle?.();
}

function registerServiceWorkerWhenIdle(): void {
  if (typeof requestIdleCallback === "function")
    requestIdleCallback(registerCurrentServiceWorker, { timeout: 3000 });
  else setTimeout(registerCurrentServiceWorker, 0);
}

/** Registers the service worker once the page has finished loading and is idle, so precaching never races hydration. */
function scheduleServiceWorker(): void {
  if (desktopGlobal !== undefined) return;
  if (document.readyState === "complete") registerServiceWorkerWhenIdle();
  else
    window.addEventListener("load", registerServiceWorkerWhenIdle, {
      once: true,
    });
}

// the real frame has replaced the static one once the first render has taken it out of #root;
// the service worker registers only once the page is idle, so its precaching never delays hydration
const staticFrame = new MutationObserver(() => {
  if (root.querySelector(":scope > .mn-static-frame") !== null) return;
  markEnd("app.frame", startedAt);
  staticFrame.disconnect();
  if (desktopGlobal === undefined) scheduleServiceWorker();
});
staticFrame.observe(root, { childList: true });

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
// the end-to-end tests read the guard's count, every command that ran and the marks, and parse XML as the app does
const runs: string[] = [];
if (flavour === "test")
  Reflect.set(window, "__manent", { guard, runs, readMarks, domXml });

const schedule = (fn: () => void, delayMs: number): (() => void) => {
  const timer = setTimeout(fn, delayMs);
  return () => clearTimeout(timer);
};
const frame = (fn: () => void): (() => void) => {
  const id = requestAnimationFrame(fn);
  return () => cancelAnimationFrame(id);
};

/** The world this tab runs in; `desktop` is the desktop app's shell and node, null on the web. */
function createEnvironment(desktop: DesktopHost | null): Environment {
  const { where, language, userAgent } = readNavigator();
  const origin = browserStorage(window);
  const updateState = createValue<UpdateState | null>(null);
  const personServices = createValue<PersonServices | null>(null);
  let webUpdate: WebUpdateController | undefined;
  let offlineReadiness: Environment["offlineReadiness"];
  if (desktop === null && desktopGlobal === undefined) {
    const swContainer =
      "serviceWorker" in navigator ? navigator.serviceWorker : null;
    const offlineWarm = createOfflineWarm({
      container: swContainer,
      now,
      schedule,
      frame,
      lastKeyAt: () => lastKeyAt,
    });
    offlineReadiness = offlineWarm.readiness;
    const ensureLifecycle = (): SwLifecycleHandle => {
      if (swLifecycle !== null) return swLifecycle;
      swLifecycle = startSwLifecycle({
        container: swContainer,
        updateState,
        now,
        schedule,
        online: () => navigator.onLine,
        lastKeyAt: () => lastKeyAt,
        onInstallPhase: offlineWarm.notifyInstallPhase,
        hasBlockingSave: () =>
          personServices.get()?.closing.guard.failing() !== null,
      });
      if (pendingBuildId !== null) {
        swLifecycle.notifyBuildId(pendingBuildId);
        pendingBuildId = null;
      }
      return swLifecycle;
    };
    startWebLifecycle = ensureLifecycle;
    webUpdate = {
      check: () => ensureLifecycle().controller.check(),
      apply: () => ensureLifecycle().controller.apply(),
      isReady: () =>
        updateState.get() === "ready" ||
        (swLifecycle?.controller.isReady() ?? false),
    };
    setActiveWebUpdate(webUpdate);
  }
  return {
    where: { ...where, shell: desktop === null ? "web" : "desktop" },
    desktop,
    updateState,
    ...(webUpdate === undefined ? {} : { webUpdate }),
    ...(offlineReadiness === undefined ? {} : { offlineReadiness }),
    language,
    userAgent,
    now,
    schedule,
    frame,
    storage: origin.storage,
    storageEvents: origin.events,
    tabStorage: tabStorage(),
    randomId: () => crypto.randomUUID(),
    lastKeyAt: () => lastKeyAt,
    guard,
    flavour,
    // the person's editor, with everything only it needs, stays out of the entry
    loadEditor: async (...args) =>
      (await import("./services/person-editor.ts")).loadEditor(...args),
    shellState: createValue<ShellState>(INITIAL_SHELL_STATE),
    dom: createShellDom(document),
    online: () => navigator.onLine,
    ran: (commandId) => {
      if (flavour === "test") runs.push(commandId);
    },
    visitUndo: { current: null },
    // sync, with everything only it needs, stays out of the entry
    startSync: async (person, deviceId) =>
      (await import("./services/sync/browser-sync.ts")).startBrowserSync({
        desktop,
        person,
        deviceId,
        now,
        onBuildId: desktop === null ? notifyServerBuildId : undefined,
      }),
    personServices,
  };
}

const usePerson = createPersonStore(tabStorage());
const api = createApi({
  fetch,
  getToken: () => usePerson.getState().person?.token ?? null,
  onBuildId: desktopGlobal === undefined ? notifyServerBuildId : undefined,
  cachedChoices: {
    read: () => readCachedChoices(),
    write: (choices) => writeCachedChoices(choices),
  },
});
const router = createAppRouter({
  api,
  fetch,
  usePerson,
  desktop: desktopGlobal !== undefined,
});
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

/** Draws the app into `container`, in the environment it returns. */
function start(
  container: HTMLElement,
  desktop: DesktopHost | null,
): Environment {
  const environment = createEnvironment(desktop);
  createRoot(container).render(
    <StrictMode>
      <EnvironmentProvider environment={environment}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </EnvironmentProvider>
    </StrictMode>,
  );
  // the shell shows the window once the page's first frame is on screen
  if (desktop !== null)
    afterFirstFrame(() => desktop.send({ v: 1, t: "first_frame" }), {
      request: environment.frame,
    });
  return environment;
}

if (desktopGlobal === undefined) start(root, null);
else
  void Promise.all([
    import("./desktop/host.ts"),
    import("./desktop/shell-channel.ts"),
  ]).then(([{ readDesktopHost }, { answerShell }]) => {
    const desktop = readDesktopHost(desktopGlobal, location.origin);
    const environment = start(root, desktop);
    if (desktop !== null)
      answerShell({
        host: desktop,
        environment,
        pathname: () => router.state.location.pathname,
      });
  });
