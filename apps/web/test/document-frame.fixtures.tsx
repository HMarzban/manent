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
} from "../src/services/ports.ts";
import { AppShell, ScreenArea } from "../src/shell/app-shell.tsx";
import { createShellDom } from "../src/shell/regions.tsx";
import { dialogActions } from "../src/state/dialog.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import { paletteActions } from "../src/state/palette.store.ts";
import { panelsActions } from "../src/state/panels.store.ts";
import type { PersonPresent } from "../src/state/people.store.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import { renameActions } from "../src/state/rename.store.ts";
import {
  createClock,
  createNavigation,
  fakeApi,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

// the shell's one document on the stand-in route
export const DOC_ID = "00000000-0000-4000-8000-000000000000";

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

/** The document the frame shows: each port a value the test sets. */
interface TestDocument extends DocumentServices {
  status: Value<StatusFacts>;
  waitingByScene: Value<readonly { scene: string; count: number }[]>;
  stateFacts: Value<readonly StateFact[]>;
  people: Value<readonly PersonPresent[]>;
}

export interface Frame extends Omit<TestDocument, "scriptBag"> {
  container: HTMLElement;
  services: PersonServices;
  clock: ReturnType<typeof createClock>;
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

/** You's services, showing `doc` and running every command, through the app's own handlers, as `role`. */
function servicesFor(
  environment: Environment,
  doc: TestDocument,
  role: CommandContext["role"],
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
      role,
      () => (usePerson.getState().person?.token ?? null) !== null,
    ),
    settings: scriptStore,
    bindings: () => base.resolved.get().effective,
    onDisabled: () => {},
  });
  environment.shellState.subscribe(commands.notify);
  const services: PersonServices = {
    ...base,
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

/** Draws the stand-in route, the frame of `DOC_ID` around the stand-in editor, in the shell. */
async function mountStandIn(
  environment: Environment,
  services: PersonServices,
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
        component: () => <DocumentFrame docId={DOC_ID} />,
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

/** The frame of the stand-in document as `role` (an editor unless given), with the title `title` and the status `status`. */
export async function renderFrame(
  options: {
    role?: CommandContext["role"];
    title?: string;
    status?: StatusFacts;
  } = {},
): Promise<Frame> {
  const clock = createClock();
  const environment = testEnvironment({
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
    scriptBag: createMemoryBag({ initial: {}, writable: () => true }),
  };
  const services = servicesFor(environment, doc, options.role ?? "editor");
  if (options.title !== undefined)
    services.library.renameDocument(DOC_ID, options.title);
  const container = await mountStandIn(environment, services);
  // the stand-in publishes its facts at the next frame
  act(() => clock.advance(16));
  return { ...doc, container, services, clock };
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
