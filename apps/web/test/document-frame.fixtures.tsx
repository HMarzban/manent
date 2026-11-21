// The document frame in the shell, over a document the test holds and a role it chooses, on the stand-in editor.
import { COMMANDS, createCommandService } from "@manent/commands";
import type { CommandContext } from "@manent/commands";
import {
  SETTINGS,
  createMemoryBag,
  createSettingsStore,
} from "@manent/settings";
import { createValue } from "@manent/ui";
import type { StateFact, StatusFacts } from "@manent/ui";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { createHandlers } from "../src/handlers/index.ts";
import { DocumentFrame } from "../src/screens/document/document-screen.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type {
  DocumentServices,
  PersonServices,
  ProjectKind,
} from "../src/services/ports.ts";
import { AppShell, ScreenArea } from "../src/shell/app-shell.tsx";
import { createShellDom } from "../src/shell/regions.tsx";
import { OutlineContext } from "../src/state/bridge-contexts.ts";
import { dialogActions } from "../src/state/dialog.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import { paletteActions } from "../src/state/palette.store.ts";
import type {
  OutlineRow,
  OutlineSelectors,
} from "../src/state/outline.store.ts";
import { panelsActions } from "../src/state/panels.store.ts";
import type { PersonPresent } from "../src/state/people.store.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import { renameActions } from "../src/state/rename.store.ts";
import {
  MemoryStorage,
  createClock,
  createNavigation,
  fakeApi,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

const DEVICE_ID = "5d0c9a7e-2b4f-4c1a-9e3d-7a6b5c4d3e2f";
// You's document on the stand-in route on this device: the device id's start, then the hex of "you"
export const DOC_ID = "5d0c9a7e-2b4f-4c1a-9e3d-000000796f75";

/** A document that has never synced, as a new script of You's. */
export const NEW_SCRIPT: StatusFacts = Object.freeze({
  access: "edit",
  device: "ok",
  network: "online",
  server: "synced",
  waiting: 0,
  notSent: 0,
  offlineSinceAt: null,
  neverSynced: true,
  shell: "web",
  toReview: 0,
  now: 0,
});

type Value<T> = ReturnType<typeof createValue<T>>;
type Environment = ReturnType<typeof testEnvironment>;

type MemoryBag = ReturnType<typeof createMemoryBag>;

/** The document the frame shows: each port a value the test sets. */
interface TestDocument extends DocumentServices {
  status: Value<StatusFacts>;
  waitingByScene: Value<readonly { scene: string; count: number }[]>;
  stateFacts: Value<readonly StateFact[]>;
  people: Value<readonly PersonPresent[]>;
  scriptBag: MemoryBag;
}

export interface Frame extends TestDocument {
  container: HTMLElement;
  services: PersonServices;
  clock: ReturnType<typeof createClock>;
  /** The outline the frame's panels read, as the editor's bridge would publish it. */
  outline: Value<readonly OutlineRow[]>;
}

let mounted: Root | null = null;

/** Unmounts the frame and closes every panel, popover and field the interface stores hold open. */
export function unmountFrame(): void {
  act(() => {
    mounted?.unmount();
    panelsActions.close("left");
    panelsActions.close("side");
    dialogActions.close();
    paletteActions.close();
    renameActions.stop();
  });
  mounted = null;
  document.body.replaceChildren();
}

/** The command context of the shell's state, with `role` for the open document. */
function contextFor(
  environment: Environment,
  role: CommandContext["role"],
  signedIn: () => boolean,
): () => CommandContext {
  return () => {
    const { docId, screen, panels, historyPresent } =
      environment.shellState.get();
    return {
      screen,
      focus: environment.dom.focusKind(),
      docOpen: docId !== null,
      role: docId === null ? null : role,
      online: true,
      platform: "mac",
      shell: "web",
      demo: false,
      signedIn: signedIn(),
      panelOpen: { left: panels.left !== null, side: panels.side !== null },
      historyPresent,
      format: null,
      rulerShown: false,
      spaceBeforeSet: false,
      zoom: null,
      zoomPercent: null,
      production: null,
    };
  };
}

/** The script settings of the one document, over its bag. */
const scriptStoreOver = (scriptBag: DocumentServices["scriptBag"]) =>
  createSettingsStore({
    registry: SETTINGS,
    bags: {
      personal: createMemoryBag({ initial: {}, writable: () => true }),
      device: createMemoryBag({ initial: {}, writable: () => true }),
      script: scriptBag,
    },
    beforeWrite: () => {},
    deferRemote: (apply) => apply(),
    locked: () => false,
  });

/** You's services, showing `doc` of `kind` and running every command, through the app's own handlers, as `role`. */
function servicesFor(
  environment: Environment,
  doc: TestDocument,
  options: { role: CommandContext["role"]; kind: ProjectKind | null },
): PersonServices {
  const usePerson = createPersonStore(null);
  const router = createNavigation({
    routeId: "/__stand-in",
    href: "/__stand-in",
    search: {},
  }).navigation;
  const base = testServices({ userId: "you", environment, router });
  const scriptStore = scriptStoreOver(doc.scriptBag);
  const handlers: Record<string, () => void> = {};
  const commands = createCommandService({
    commands: COMMANDS,
    handlers,
    context: contextFor(
      environment,
      options.role,
      () => (usePerson.getState().person?.token ?? null) !== null,
    ),
    settings: scriptStore,
    bindings: () => base.resolved.get().effective,
    onDisabled: () => {},
  });
  environment.shellState.subscribe(commands.notify);
  // the stand-in's document is in no index: its title is the fixture's own
  const title = createValue<string | null>(null);
  const services: PersonServices = {
    ...base,
    library: {
      ...base.library,
      documentTitle: () => title,
      documentKind: () => createValue(options.kind),
      renameDocument: (_docId, named) => title.set(named),
    },
    documents: { open: () => doc, close: () => {} },
    openScriptStore: () => scriptStore,
    commands,
  };
  Object.assign(
    handlers,
    createHandlers({
      ...environment,
      services,
      api: fakeApi(),
      usePerson,
      router,
      shellState: environment.shellState.get,
    }),
  );
  return services;
}

/** The outline of `rows`; `broken` makes every row throw when it is read. */
function outlineOf(
  rows: Value<readonly OutlineRow[]>,
  broken: boolean,
): OutlineSelectors {
  return {
    count: () => rows.get().length,
    row(index) {
      if (broken) throw new Error("the outline's row cannot be read");
      return rows.get()[index] ?? null;
    },
    subscribe: (listener) => rows.subscribe(listener),
  };
}

/** Draws the stand-in route, the frame of `DOC_ID` around the stand-in editor, in the shell, over `outline`. */
async function mountStandIn(
  environment: Environment,
  services: PersonServices,
  outline: OutlineSelectors,
): Promise<HTMLElement> {
  const rootRoute = createRootRoute({
    component: () => (
      <ServicesProvider services={services}>
        <AppShell>
          <ScreenArea>
            <Outlet />
          </ScreenArea>
        </AppShell>
      </ServicesProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/__stand-in",
        component: () => (
          <OutlineContext value={outline}>
            <DocumentFrame docId={DOC_ID} />
          </OutlineContext>
        ),
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/__stand-in"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  await act(async () =>
    mounted?.render(
      <EnvironmentProvider environment={environment}>
        <RouterProvider router={router} />
      </EnvironmentProvider>,
    ),
  );
  return container;
}

/**
 * The frame of the stand-in document as `role` (an editor unless given), with `title`, `status`, the script's
 * `scriptBag` and its project's `kind`, in a window `viewportWidthPx` wide (1600 unless given), from `startAt`.
 */
export async function renderFrame(
  options: {
    role?: CommandContext["role"];
    title?: string;
    status?: StatusFacts;
    scriptBag?: MemoryBag;
    kind?: ProjectKind;
    viewportWidthPx?: number;
    startAt?: number;
    brokenOutline?: boolean;
  } = {},
): Promise<Frame> {
  const viewport: unknown = Reflect.get(window, "happyDOM");
  const setViewport: unknown =
    typeof viewport === "object" && viewport !== null
      ? Reflect.get(viewport, "setViewport")
      : null;
  if (typeof setViewport !== "function")
    throw new Error("happy-dom's window cannot be resized");
  Reflect.apply(setViewport, viewport, [
    { width: options.viewportWidthPx ?? 1600, height: 900 },
  ]);
  const clock = createClock(options.startAt);
  const storage = new MemoryStorage();
  storage.setItem("manent.device.id", DEVICE_ID);
  const environment = testEnvironment({
    storage,
    dom: createShellDom(document),
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => clock.schedule(fn, 16),
  });
  bindGuard(environment.guard);
  const doc: TestDocument = {
    status: createValue(options.status ?? NEW_SCRIPT),
    waitingByScene: createValue<readonly { scene: string; count: number }[]>(
      [],
    ),
    stateFacts: createValue<readonly StateFact[]>([]),
    people: createValue<readonly PersonPresent[]>([]),
    scriptBag:
      options.scriptBag ??
      createMemoryBag({ initial: {}, writable: () => true }),
  };
  const services = servicesFor(environment, doc, {
    role: options.role ?? "editor",
    kind: options.kind ?? null,
  });
  if (options.title !== undefined)
    services.library.renameDocument(DOC_ID, options.title);
  const outline = createValue<readonly OutlineRow[]>([]);
  const container = await mountStandIn(
    environment,
    services,
    outlineOf(outline, options.brokenOutline ?? false),
  );
  // the shell shows the stand-in's document once it is made
  await act(() => until(() => environment.shellState.get().docId === DOC_ID));
  // the stand-in publishes its facts at the next frame
  act(() => clock.advance(16));
  return { ...doc, container, services, clock, outline };
}

/** What a control is called: its label, else its text without what is hidden from assistive technology. */
export function nameOf(element: Element): string {
  const label = element.getAttribute("aria-label");
  if (label !== null) return label;
  const copy = element.cloneNode(true);
  if (!(copy instanceof Element)) return "";
  for (const hidden of copy.querySelectorAll("[aria-hidden='true']"))
    hidden.remove();
  return copy.textContent ?? "";
}

/** The region of the shell named `region`; throws when it is not drawn. */
export function region(container: ParentNode, name: string): HTMLElement {
  const found = container.querySelector(`[data-region="${name}"]`);
  if (!(found instanceof HTMLElement))
    throw new Error(`no ${name} region is drawn`);
  return found;
}

/** The button inside `within` called `name`; throws when there is none. */
export function buttonNamed(within: ParentNode, name: string): HTMLElement {
  const found = [...within.querySelectorAll("button")].find(
    (button) => nameOf(button) === name,
  );
  if (found === undefined) throw new Error(`no button called ${name}`);
  return found;
}

/** Clicks `element` as a pointer does, which is how Base UI's triggers open. */
export async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
    );
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    element.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }),
    );
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Presses `key` on `target`, as the keyboard does. */
export function press(target: Element, key: string): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

/** Types `text` into `input`, replacing what it holds; React reads the new value when the key is released. */
export function typeInto(input: HTMLInputElement, text: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });
}
