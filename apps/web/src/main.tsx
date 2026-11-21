import { markEnd, markStart, readMarks, setMarksEnabled } from "@manent/perf";
import type { SyncClientOptions } from "@manent/sync-client";
import { createValue } from "@manent/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createApi } from "./api.ts";
import { registerServiceWorker } from "./boot/register-sw.ts";
import { afterFirstFrame } from "./desktop/first-frame.ts";
import type { DesktopHost } from "./desktop/host.ts";
import { readNavigator } from "./platform.ts";
import { createAppRouter } from "./router.tsx";
import { EnvironmentProvider } from "./services/context.tsx";
import { browserStorage } from "./services/local-map.ts";
import { INITIAL_SHELL_STATE } from "./services/ports.ts";
import type { Environment, ShellState } from "./services/ports.ts";
import type { PersonSync } from "./services/sync/create-sync.ts";
import { tabStorage } from "./session.ts";
import type { TabPerson } from "./session.ts";
import { createShellDom } from "./shell/regions.tsx";
import { bindGuard, createGuard } from "./state/guard.ts";
import { createPersonStore } from "./state/person.store.ts";

// the build's defines; absent outside a build
declare const MANENT_FLAVOUR: string | undefined;
declare const MANENT_VERSION: string | undefined;

const flavour =
  typeof MANENT_FLAVOUR !== "undefined" && MANENT_FLAVOUR === "test"
    ? "test"
    : "production";
// the test build times the interface from its first statement; -1 everywhere else, which records nothing
if (flavour === "test") setMarksEnabled(true);
const startedAt = markStart();

const root = document.getElementById("root");
if (root === null) throw new Error("the page has no #root element");

// the real frame has replaced the static one once the first render has taken it out of #root;
// the service worker registers only then, so its precaching never delays the first frame
const staticFrame = new MutationObserver(() => {
  if (root.querySelector(":scope > .mn-static-frame") !== null) return;
  markEnd("app.frame", startedAt);
  staticFrame.disconnect();
  registerServiceWorker({
    container: "serviceWorker" in navigator ? navigator.serviceWorker : null,
  });
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
// the end-to-end tests read the guard's count, every command that ran and the marks
const runs: string[] = [];
if (flavour === "test")
  Reflect.set(window, "__manent", { guard, runs, readMarks });

/** The parts of the person's sync that differ on desktop, where the node is the window's server and store. */
async function nodeSync(
  person: TabPerson,
): Promise<Pick<SyncClientOptions, "via" | "ports">> {
  const [web, node] = await Promise.all([
    import("@manent/client-web"),
    import("./desktop/desktop-sync.ts"),
  ]);
  const { via, store, transport } = node.desktopSyncParts({
    origin: location.origin,
    userId: person.userId,
    token: () => person.token,
  });
  // the leader, clock, random and frames stay the web's own
  const leader = web.webLeader({
    userId: person.userId,
    tabId: crypto.randomUUID(),
  });
  return {
    via,
    ports: {
      store,
      transport,
      leader,
      clock: web.browserClock,
      random: web.browserRandom,
      frames: web.browserFrames,
    },
  };
}

// sync, with everything only it needs, stays out of the entry
async function startSync(
  desktop: DesktopHost | null,
  person: TabPerson,
  deviceId: string,
): Promise<PersonSync> {
  const [sync, device, { PROTOCOL_VERSION }, { SCHEMA_VERSION }, engine] =
    await Promise.all([
      import("./services/sync/create-sync.ts"),
      import("./services/sync/device-memory.ts"),
      import("@manent/sync-protocol"),
      import("@manent/schema"),
      import("@manent/pagination"),
    ]);
  const versions = {
    protocol: PROTOCOL_VERSION,
    schema: SCHEMA_VERSION,
    engine: engine.ENGINE_VERSION,
    table: engine.TABLE_VERSION,
  };
  return sync.createPersonSync({
    person,
    baseUrl: location.origin,
    deviceId,
    build: typeof MANENT_VERSION === "undefined" ? "0.0.0" : MANENT_VERSION,
    versions,
    // the server that serves this build runs the same versions
    minServer: versions,
    memory: device.createDeviceMemory(device.browserStores()),
    onlineEvents: window,
    visible: () => document.visibilityState === "visible",
    now,
    ...(desktop === null ? {} : await nodeSync(person)),
  });
}

/** The world this tab runs in; `desktop` is the desktop app's shell and node, null on the web. */
function createEnvironment(desktop: DesktopHost | null): Environment {
  const { where, language, userAgent } = readNavigator();
  const origin = browserStorage(window);
  return {
    where: { ...where, shell: desktop === null ? "web" : "desktop" },
    desktop,
    language,
    userAgent,
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
    startSync: (person, deviceId) => startSync(desktop, person, deviceId),
  };
}

const usePerson = createPersonStore(tabStorage());
const api = createApi({
  fetch,
  getToken: () => usePerson.getState().person?.token ?? null,
});
const router = createAppRouter({ api, fetch, usePerson });
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

/** Draws the app into `container`. */
function start(container: HTMLElement, desktop: DesktopHost | null): void {
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
}

// the desktop app's node writes the shell's startup values into the page it serves; the web has none, and never loads
// what reads them
const desktopGlobal: unknown = Reflect.get(window, "manentDesktop");
if (desktopGlobal === undefined) start(root, null);
else
  void import("./desktop/host.ts").then(({ readDesktopHost }) =>
    start(root, readDesktopHost(desktopGlobal, location.origin)),
  );
