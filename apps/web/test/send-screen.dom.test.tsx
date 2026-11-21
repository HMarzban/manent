import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { createValue, messageFor, useSubscribable } from "@manent/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { AnyRouter } from "@tanstack/react-router";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { RootLayout } from "../src/root-layout.tsx";
import type { SendForm } from "../src/screens/send/forms.ts";
import { SendFrame } from "../src/screens/send/send-frame.tsx";
import type { SendAction, SendRow } from "../src/screens/send/send-frame.tsx";
import { SendScreen } from "../src/screens/send/send-screen.tsx";
import { EnvironmentProvider, useServices } from "../src/services/context.tsx";
import type { PersonServices } from "../src/services/ports.ts";
import { createShellDom } from "../src/shell/regions.tsx";
import { bindGuard } from "../src/state/guard.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import { createClock, fakeApi, testEnvironment } from "./services.fixtures.ts";

withDom();

// happy-dom lays nothing out: an element is as wide as 8 px per character it holds
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get(this: HTMLElement): number {
    return (this.textContent?.length ?? 0) * 8;
  },
});

const LEO = { token: null, userId: "leo", name: "Leo Marsh" };

const IDLE: SendAction = {
  label: "Print 14 pages",
  busyLabel: "Printing 14 pages…",
  busy: false,
  disabledReason: null,
  problem: null,
  progress: null,
  cancel: null,
  run: () => {},
};

interface Fixture {
  title: string;
  rows: readonly SendRow[];
  action: SendAction;
}

const MEMO_ROW: SendRow = {
  id: "memo",
  content: <input aria-label="Memo text" />,
};
const fixture = createValue<Fixture>({
  title: "Print 14 pages",
  rows: [MEMO_ROW],
  action: IDLE,
});
const setAction = (action: Partial<SendAction>): void =>
  act(() =>
    fixture.set({
      ...fixture.get(),
      action: { ...fixture.get().action, ...action },
    }),
  );

function FixtureBody(): ReactNode {
  const { title, rows, action } = useSubscribable(fixture);
  return (
    <SendFrame
      title={title}
      aside={null}
      rows={rows}
      pages={<p>Page 1</p>}
      action={action}
    />
  );
}

let available = true;
const PRINT: SendForm = {
  id: "print",
  useAvailable: () => available,
  Body: FixtureBody,
};

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  available = true;
  fixture.set({ title: "Print 14 pages", rows: [MEMO_ROW], action: IDLE });
});

/** The services the shell was last drawn with. */
let services: PersonServices | null = null;

function ServicesProbe(): ReactNode {
  services = useServices();
  return <h1 tabIndex={-1}>Library</h1>;
}

/** The app at `/`, then at `path`. */
async function renderApp(path: string): Promise<{
  router: AnyRouter;
  container: HTMLElement;
  clock: ReturnType<typeof createClock>;
}> {
  const clock = createClock();
  const environment = testEnvironment({
    dom: createShellDom(document),
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => clock.schedule(fn, 16),
  });
  bindGuard(environment.guard);
  const usePerson = createPersonStore(null);
  usePerson.getState().setPerson(LEO);
  const api = fakeApi();
  const rootRoute = createRootRoute({
    component: () => (
      <RootLayout api={api} fetch={fetch} usePerson={usePerson} />
    ),
  });
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: ServicesProbe,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/s/$docId",
      component: () => <h1 tabIndex={-1}>The Lamp Room</h1>,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/s/$docId/send/$form",
      component: () => <SendScreen forms={[PRINT]} />,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  await act(async () =>
    mounted?.render(
      <QueryClientProvider client={new QueryClient()}>
        <EnvironmentProvider environment={environment}>
          <RouterProvider router={router} />
        </EnvironmentProvider>
      </QueryClientProvider>,
    ),
  );
  await act(() => router.navigate({ href: path }));
  return { router, container, clock };
}

const buttonNamed = (container: HTMLElement, name: string): HTMLElement => {
  const found = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
};

/** The frame's one primary button: the last button of the screen before its status bar. */
const actionButton = (container: HTMLElement): HTMLElement | undefined =>
  [...container.querySelectorAll("button")]
    .filter((b) => b.closest("[data-region='status_bar']") === null)
    .at(-1);

test("a registered form opens on its route, titled by its action, with focus on the title", async () => {
  const { router, container } = await renderApp("/");
  const library = services?.library;
  if (library === undefined) throw new Error("the shell was never drawn");
  const made = await act(() => library.createProject("leo", "film"));
  act(() => library.renameDocument(made.docId, "The Lamp Room"));
  await act(() => router.navigate({ href: `/s/${made.docId}/send/print` }));
  const heading = container.querySelector("h1");
  expect([
    heading?.textContent,
    document.activeElement === heading,
    buttonNamed(container, "‹ The Lamp Room").tagName,
  ]).toEqual(["Print 14 pages", true, "BUTTON"]);
});

test("an unknown or unavailable form goes back to the document", async () => {
  const unknown = await renderApp("/s/d1/send/issue");
  const afterUnknown = [
    unknown.router.state.location.pathname,
    unknown.router.history.length,
  ];
  act(() => mounted?.unmount());
  available = false;
  const unavailable = await renderApp("/s/d1/send/print");
  expect([
    afterUnknown,
    [
      unavailable.router.state.location.pathname,
      unavailable.router.history.length,
    ],
  ]).toEqual([
    ["/s/d1", 2],
    ["/s/d1", 2],
  ]);
});

test("rows are drawn in their fixed order with their labels, whatever order they are given", async () => {
  fixture.set({
    ...fixture.get(),
    rows: [
      { id: "to", content: "Nobody" },
      { id: "what", content: "Whole script" },
      { id: "checks", content: "Nothing to check" },
    ],
  });
  const { container } = await renderApp("/s/d1/send/print");
  const pairs = [...container.querySelectorAll("dl > div")].map((row) => [
    row.querySelector("dt")?.textContent,
    row.querySelector("dd")?.textContent,
  ]);
  expect(pairs).toEqual([
    ["Checks", "Nothing to check"],
    ["What", "Whole script"],
    ["To", "Nobody"],
  ]);
});

test("the pages are a region named for what they are", async () => {
  const { container } = await renderApp("/s/d1/send/print");
  const region = container.querySelector("section");
  expect([region?.getAttribute("aria-label"), region?.textContent]).toEqual([
    "The pages as they will go",
    "Page 1",
  ]);
});

test("a busy button keeps its width, shows its progressive label, then the spinner, then Still working…", async () => {
  fixture.set({ ...fixture.get(), title: "Issue Pink" });
  setAction({ label: "Issue Pink", busyLabel: "Issuing Pink…" });
  const { container, clock } = await renderApp("/s/d1/send/print");
  const idle = actionButton(container)?.textContent;
  setAction({ busy: true });
  const button = () => actionButton(container);
  const atStart = [
    button()?.textContent,
    button()?.style.width,
    button()?.getAttribute("aria-disabled"),
    button()?.querySelector("svg") !== null,
  ];
  act(() => clock.advance(399));
  const before = button()?.querySelector("svg") !== null;
  act(() => clock.advance(1));
  const spinning = button()?.querySelector("svg") !== null;
  act(() => clock.advance(4599));
  const waiting = container.textContent?.includes("Still working…");
  act(() => clock.advance(1));
  const still = container.textContent?.includes("Still working…");
  expect([idle, atStart, before, spinning, waiting, still]).toEqual([
    "Issue Pink",
    ["Issuing Pink…", "80px", "true", false],
    false,
    true,
    false,
    true,
  ]);
});

test("a refusal shows above the button, takes focus, and keeps what was entered", async () => {
  const { container } = await renderApp("/s/d1/send/print");
  const field = container.querySelector("input");
  if (field === null) throw new Error("no memo field");
  act(() => {
    field.value = "Pink revisions";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const problem = "Couldn't reach Manent. Try again when it can be reached.";
  setAction({ problem });
  const line = document.activeElement;
  const button = actionButton(container);
  expect([
    line?.textContent,
    line?.getAttribute("tabindex"),
    line?.closest("[aria-live]"),
    Boolean(
      line !== null &&
      button !== undefined &&
      line.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ),
    container.querySelector("input")?.value,
  ]).toEqual([problem, "-1", null, true, "Pink revisions"]);
});

test("a disabled button says why and stays focusable", async () => {
  let runs = 0;
  setAction({
    label: "Issue Pink…",
    disabledReason: "needs this device's 12 waiting changes synced first",
    run: () => {
      runs++;
    },
  });
  const { container } = await renderApp("/s/d1/send/print");
  const button = actionButton(container);
  if (button === undefined) throw new Error("no action button");
  act(() => button.click());
  act(() => button.focus());
  const described = document.getElementById(
    button.getAttribute("aria-describedby") ?? "",
  );
  expect([
    described?.textContent,
    Boolean(
      described !== null &&
      described.compareDocumentPosition(button) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ),
    button.getAttribute("aria-disabled"),
    document.activeElement === button,
    runs,
  ]).toEqual([
    "Issue Pink needs this device's 12 waiting changes synced first.",
    true,
    "true",
    true,
    0,
  ]);
});

test("a button whose work is still opening is disabled without a line above it and stays focusable", async () => {
  setAction({ run: null });
  const { container } = await renderApp("/s/d1/send/print");
  const button = actionButton(container);
  if (button === undefined) throw new Error("no action button");
  act(() => button.click());
  act(() => button.focus());
  expect([
    button.textContent,
    button.getAttribute("aria-disabled"),
    button.getAttribute("aria-describedby"),
    button.parentElement?.previousElementSibling?.tagName ?? null,
    document.activeElement?.textContent,
  ]).toEqual(["Print 14 pages", "true", null, null, "Print 14 pages"]);
});

test("long work shows its progress in words, then offers Cancel", async () => {
  let cancels = 0;
  setAction({
    progress: "Page 37 of 120",
    cancel: () => {
      cancels++;
    },
  });
  const { container, clock } = await renderApp("/s/d1/send/print");
  setAction({ busy: true });
  const shows = (text: string): boolean | undefined =>
    container.textContent?.includes(text);
  const hasCancel = (): boolean =>
    [...container.querySelectorAll("button")].some(
      (b) => b.textContent === "Cancel",
    );
  act(() => clock.advance(1999));
  const early = [shows("Page 37 of 120"), hasCancel()];
  act(() => clock.advance(1));
  const progress = shows("Page 37 of 120");
  act(() => clock.advance(7999));
  const beforeCancel = hasCancel();
  act(() => clock.advance(1));
  const offered = hasCancel();
  act(() => buttonNamed(container, "Cancel").click());
  expect([early, progress, beforeCancel, offered, cancels]).toEqual([
    [false, false],
    true,
    false,
    true,
    1,
  ]);
});

test("Escape never leaves the Send screen", async () => {
  const { router, container } = await renderApp("/s/d1/send/print");
  const heading = container.querySelector("h1");
  act(() => {
    heading?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect([
    router.state.location.pathname,
    document.activeElement === heading,
  ]).toEqual(["/s/d1/send/print", true]);
});

test("the screen has no status, keeps the message slot and Commands, and covers the editor host without unmounting it", async () => {
  const { router, container } = await renderApp("/s/d1");
  const host = container.querySelector("[data-editor-host]");
  const shown = host?.hasAttribute("inert");
  await act(() => router.navigate({ href: "/s/d1/send/print" }));
  act(() =>
    services?.messages.push(
      messageFor({ kind: "preferences_reset", count: 1 }),
    ),
  );
  const bar = container.querySelector("[data-region='status_bar']");
  expect([
    shown,
    container.querySelector("[data-editor-host]") === host,
    host?.hasAttribute("inert"),
    bar?.querySelector("[role='status']")?.textContent,
    [...(bar?.querySelectorAll("button") ?? [])].map((b) => b.textContent),
    container.textContent?.includes("Only in this browser"),
  ]).toEqual([
    false,
    true,
    true,
    "1 preference reset.Undo",
    ["Undo", "Commands"],
    false,
  ]);
});
