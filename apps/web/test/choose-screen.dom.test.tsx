import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import type { SignInChoice } from "@manent/sync-protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { Api, SignInResult } from "../src/api.ts";
import { resetBrowserInstallStore } from "../src/pwa/install.ts";
import { ChooseScreen } from "../src/screens/choose.tsx";
import { EnvironmentProvider } from "../src/services/context.tsx";
import type { TabPerson } from "../src/session.ts";
import { fakeApi, testEnvironment } from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

withDom();

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  resetBrowserInstallStore();
  document.documentElement.removeAttribute("data-theme");
  document.body.replaceChildren();
});

const ROSTER: readonly SignInChoice[] = [
  {
    userId: "dana",
    name: "Dana Reyes",
    title: "Showrunner, workspace owner",
    registered: true,
  },
  {
    userId: "priya",
    name: "Priya Nair",
    title: "Script coordinator, editor with production permissions",
    registered: true,
  },
  {
    userId: "ana",
    name: "Ana Costa",
    title: "News producer, editor of rundowns",
    registered: true,
  },
  {
    userId: "you",
    name: "You",
    title: "A new person with an empty workspace",
    registered: false,
  },
];

async function renderChoose(options: {
  api: Api;
  person?: TabPerson | null;
  compact?: boolean;
}): Promise<HTMLDivElement> {
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/choose",
        component: () => (
          <ChooseScreen
            api={options.api}
            person={options.person ?? null}
            setPerson={() => {}}
            next="/"
            compact={options.compact}
          />
        ),
      }),
      createRoute({ getParentRoute: () => rootRoute, path: "/" }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/choose"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.append(container);
  mounted = createRoot(container);
  await act(async () => {
    mounted?.render(
      <EnvironmentProvider environment={testEnvironment()}>
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: { queries: { retry: false } },
            })
          }
        >
          <RouterProvider router={router} />
        </QueryClientProvider>
      </EnvironmentProvider>,
    );
  });
  await act(() =>
    until(() => container.querySelectorAll("button.mn-choose-card").length > 0),
  );
  return container;
}

test("hovering and focusing person cards updates the Studio Desk folio and resets on leave", async () => {
  const container = await renderChoose({
    api: fakeApi({ choices: async () => ROSTER }),
  });
  const aside = container.querySelector("aside");
  expect(aside).not.toBeNull();
  // defaults to the first person in the roster (Dana)
  expect(aside?.textContent).toContain("Writers' room · The Long Night");

  const cards = [
    ...container.querySelectorAll<HTMLButtonElement>("button.mn-choose-card"),
  ];
  const priya = cards.find((c) => c.textContent?.includes("Priya Nair"))!;
  const ana = cards.find((c) => c.textContent?.includes("Ana Costa"))!;

  // focusing Priya switches the folio to Blue revision pages
  act(() => {
    priya.focus();
  });
  expect(priya.getAttribute("data-spotlight")).toBe("true");
  expect(aside?.textContent).toContain("The Long Night · Blue pages");
  expect(
    aside?.querySelector('.mn-choose-sheet[data-rev="blue"]'),
  ).not.toBeNull();

  // hovering Ana switches the folio to the live broadcast rundown view
  act(() => {
    ana.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  expect(aside?.textContent).toContain("News · Evening bulletin");
  expect(aside?.querySelectorAll(".mn-choose-rundown-row").length).toBe(3);

  // leaving the roster returns to the default person
  const list = container.querySelector("ul")!;
  act(() => {
    list.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
  });
  expect(aside?.textContent).toContain("Writers' room · The Long Night");
});

test("choosing a person marks the clicked card pending and dims sibling cards until sign-in settles", async () => {
  const pendingSignIn = Promise.withResolvers<SignInResult>();
  const container = await renderChoose({
    api: fakeApi({
      choices: async () => ROSTER,
      signIn: () => pendingSignIn.promise,
    }),
  });
  const cards = [
    ...container.querySelectorAll<HTMLButtonElement>("button.mn-choose-card"),
  ];
  const dana = cards.find((c) => c.textContent?.includes("Dana Reyes"))!;
  const priya = cards.find((c) => c.textContent?.includes("Priya Nair"))!;

  await act(async () => {
    dana.click();
    await until(() => dana.getAttribute("data-pending") === "true");
  });

  expect(dana.getAttribute("data-pending")).toBe("true");
  expect(dana.getAttribute("aria-busy")).toBe("true");
  expect(priya.getAttribute("data-dimmed")).toBe("true");
  expect(dana.disabled).toBe(true);
  expect(priya.disabled).toBe(true);

  await act(async () => {
    pendingSignIn.resolve({
      ok: true,
      person: { token: "tok", userId: "dana", name: "Dana Reyes" },
    });
    await pendingSignIn.promise;
  });
});

test("compact mode hides the Studio Desk folio and pillars while keeping AI pledge chevron toggle", async () => {
  const container = await renderChoose({
    api: fakeApi({ choices: async () => ROSTER }),
    compact: true,
  });
  expect(container.querySelector("aside")).toBeNull();
  expect(container.textContent).not.toContain("Pages as they print");

  const pledgeBtn = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Read the AI pledge",
  )!;
  const chevron = pledgeBtn.querySelector(".mn-choose-chevron");
  expect(chevron?.hasAttribute("data-open")).toBe(false);

  act(() => pledgeBtn.click());
  expect(chevron?.hasAttribute("data-open")).toBe(true);
});

test("masthead theme switch toggles Light and Dark on html[data-theme]", async () => {
  const container = await renderChoose({
    api: fakeApi({ choices: async () => ROSTER }),
  });
  const darkInput = container.querySelector<HTMLInputElement>(
    'input[type="radio"][value="dark"]',
  )!;
  const lightInput = container.querySelector<HTMLInputElement>(
    'input[type="radio"][value="light"]',
  )!;
  expect(darkInput).not.toBeNull();
  expect(lightInput).not.toBeNull();

  act(() => {
    darkInput.click();
  });
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  expect(darkInput.checked).toBe(true);

  act(() => {
    lightInput.click();
  });
  expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  expect(lightInput.checked).toBe(true);
});

test("studio footer links to desktop releases, GitHub, and triggers live PWA install prompt", async () => {
  const container = await renderChoose({
    api: fakeApi({ choices: async () => ROSTER }),
  });
  const links = [...container.querySelectorAll<HTMLAnchorElement>("nav a")];
  expect(links.map((a) => a.getAttribute("href"))).toEqual([
    "https://github.com/HMarzban/manent/releases",
    "https://github.com/HMarzban/manent",
  ]);

  let prompted = 0;
  const installEvent = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(installEvent, {
    prompt: async () => {
      prompted += 1;
    },
    userChoice: Promise.resolve({ outcome: "accepted" }),
  });
  act(() => {
    window.dispatchEvent(installEvent);
  });

  const installTrigger = container.querySelector<HTMLAnchorElement>(
    'nav a[href="#install"]',
  );
  expect(installTrigger).not.toBeNull();
  expect(installTrigger?.textContent).toContain("Install Manent");

  await act(async () => {
    installTrigger?.click();
    await Promise.resolve();
  });
  expect(prompted).toBe(1);
});
