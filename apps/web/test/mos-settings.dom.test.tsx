import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { BROADCAST_MOS_WORDS } from "@manent/ui";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { DetailsBroadcast } from "../src/rundown/details-broadcast.tsx";
import { BroadcastGroup } from "../src/screens/workspace-settings/broadcast-group.tsx";
import {
  GROUP_COMPONENTS,
  WORKSPACE_SETTINGS_GROUPS,
} from "../src/screens/workspace-settings/groups.ts";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { fakeApi, testEnvironment, testServices } from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

withDom();

const DOC_ID = "11111111-1111-4111-8111-111111111111";

let mounted: Root | null = null;
const originalFetch = globalThis.fetch;

afterEach(() => {
  act(() => {
    mounted?.unmount();
  });
  mounted = null;
  document.body.innerHTML = "";
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    input.focus();
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });
}

function mountInProviders(
  node: ReactNode,
  options: { online?: boolean; workspaceIds?: readonly string[] } = {},
): { container: HTMLElement; history: ReturnType<typeof createMemoryHistory> } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const env = testEnvironment({ online: () => options.online ?? true });
  const wsIds = options.workspaceIds ?? ["ws-1"];
  const services = testServices({
    userId: "ana",
    environment: env,
    api: fakeApi({
      me: async () => ({
        ok: true,
        me: {
          userId: "ana",
          name: "Ana",
          workspaces: wsIds.map((id) => ({ id, name: id, seeding: null })),
        },
      }),
    }),
  });
  const history = createMemoryHistory({ initialEntries: ["/"] });
  const rootRoute = createRootRoute({
    component: () => (
      <EnvironmentProvider environment={env}>
        <ServicesProvider services={services}>{node}</ServicesProvider>
      </EnvironmentProvider>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/w/$workspaceId/settings/$group",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, settingsRoute]),
    history,
  });
  mounted = createRoot(container);
  act(() => {
    mounted!.render(<RouterProvider router={router} />);
  });
  return { container, history };
}

test("BroadcastGroup shows loading skeleton, lazy-loads in groups.ts, and progressively discloses advanced details", async () => {
  expect(WORKSPACE_SETTINGS_GROUPS).toContain("broadcast");
  let resolveGet: ((res: Response) => void) | null = null;
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => {
      resolveGet = resolve;
    })) as unknown as typeof fetch;

  const Slot = GROUP_COMPONENTS.broadcast;
  const { container } = mountInProviders(
    <Slot workspaceId="ws-progressive" canChange online />,
  );

  await until(
    () =>
      container.querySelector('[data-tour="workspace:broadcast"]') !== null &&
      resolveGet !== null,
  );
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();

  await act(async () => {
    resolveGet!(jsonResponse({ config: null, status: "off" }));
    await Promise.resolve();
  });

  await until(() => container.querySelector('[data-tour="mos:save"]') !== null);
  expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  // Only 1 upfront text input (Prompter address); advanced studio fields are hidden until expanded.
  expect(container.querySelectorAll("input").length).toBe(1);
  expect(container.textContent).toContain(BROADCAST_MOS_WORDS.autoscript);
  expect(container.textContent).toContain(BROADCAST_MOS_WORDS.mosStandard);
  expect(container.textContent).not.toContain(
    BROADCAST_MOS_WORDS.lowerPortLabel,
  );

  const advBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
    btn.textContent?.includes(BROADCAST_MOS_WORDS.advancedToggle),
  );
  expect(advBtn?.getAttribute("aria-expanded")).toBe("false");
  act(() => {
    advBtn!.click();
  });
  expect(advBtn?.getAttribute("aria-expanded")).toBe("true");
  expect(container.textContent).toContain(BROADCAST_MOS_WORDS.lowerPortLabel);
  expect(container.textContent).toContain(BROADCAST_MOS_WORDS.upperPortLabel);
  expect(container.textContent).toContain(BROADCAST_MOS_WORDS.ncsIdLabel);
  expect(container.textContent).toContain(BROADCAST_MOS_WORDS.mosIdLabel);
  expect(container.textContent).toContain(
    BROADCAST_MOS_WORDS.allowedNetworksLabel,
  );
});

test("BroadcastGroup saves, checks, reports SSRF host_not_allowed, and confirms removal in place", async () => {
  let savedBody: Record<string, unknown> | null = null;
  let deleted = false;
  let checkCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/mos") && method === "GET") {
      return jsonResponse({ config: null, status: "off" });
    }
    if (url.endsWith("/mos/check") && method === "POST") {
      checkCount += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as { host?: string };
      if (body.host === "169.254.169.254") {
        return jsonResponse({ ok: false, reason: "host_not_allowed" });
      }
      return jsonResponse({ ok: true });
    }
    if (url.endsWith("/mos") && method === "PUT") {
      savedBody = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      return jsonResponse({
        config: {
          dialect: savedBody.dialect,
          host: savedBody.host,
          lowerPort: savedBody.lowerPort,
          upperPort: savedBody.upperPort,
          ncsId: savedBody.ncsId,
          mosId: savedBody.mosId,
          allowedCidrs: savedBody.allowedCidrs,
          enabled: true,
        },
        status: "waiting",
      });
    }
    if (url.endsWith("/mos") && method === "DELETE") {
      deleted = true;
      return jsonResponse({ removed: true });
    }
    return jsonResponse({ error: "not_found" }, 404);
  }) as unknown as typeof fetch;

  const { container } = mountInProviders(
    <BroadcastGroup workspaceId="ws-save-flow" canChange online />,
  );
  await until(() => container.querySelector('[data-tour="mos:save"]') !== null);

  const hostInput = container.querySelector("input")!;
  setInputValue(hostInput, "169.254.169.254");
  const checkBtn = Array.from(container.querySelectorAll("button")).find(
    (btn) => btn.textContent?.includes(BROADCAST_MOS_WORDS.check),
  )!;
  await act(async () => {
    checkBtn.click();
    await Promise.resolve();
  });
  await until(
    () =>
      container.textContent?.includes(
        BROADCAST_MOS_WORDS.outsideStudioNetwork("169.254.169.254"),
      ) === true,
  );

  setInputValue(hostInput, "10.0.0.42");
  await act(async () => {
    checkBtn.click();
    await Promise.resolve();
  });
  await until(
    () =>
      container.querySelector('[role="status"]')?.textContent ===
      BROADCAST_MOS_WORDS.statusLive,
  );
  expect(checkCount).toBe(2);

  const saveBtn = container.querySelector<HTMLButtonElement>(
    '[data-tour="mos:save"]',
  )!;
  await act(async () => {
    saveBtn.click();
    await Promise.resolve();
  });
  await until(() => savedBody !== null);
  expect(savedBody!.host).toBe("10.0.0.42");
  expect(savedBody!.dialect).toBe("autoscript_winplus_ip");
  expect(savedBody!.lowerPort).toBe(10540);
  expect(savedBody!.upperPort).toBe(10541);

  // In-place confirmation row (zero modal dialog!)
  await until(() =>
    Array.from(container.querySelectorAll("button")).some(
      (btn) => btn.textContent === BROADCAST_MOS_WORDS.remove,
    ),
  );
  const removeBtn = Array.from(container.querySelectorAll("button")).find(
    (btn) => btn.textContent === BROADCAST_MOS_WORDS.remove,
  )!;
  act(() => {
    removeBtn.click();
  });
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.textContent).toContain(
    BROADCAST_MOS_WORDS.removeConfirmTitle,
  );

  const confirmRemoveBtn = Array.from(
    container.querySelectorAll("button"),
  ).find((btn) => btn.textContent === BROADCAST_MOS_WORDS.remove)!;
  await act(async () => {
    confirmRemoveBtn.click();
    await Promise.resolve();
  });
  await until(() => deleted);
  expect(container.textContent).not.toContain(
    BROADCAST_MOS_WORDS.removeConfirmTitle,
  );
});

test("BroadcastGroup handles offline, failed load retry, and non-owner compact readout", async () => {
  // 1. Offline without cache never sticks on loading.
  const offlineMount = mountInProviders(
    <BroadcastGroup workspaceId="ws-offline-empty" canChange online={false} />,
    { online: false },
  );
  await until(
    () =>
      offlineMount.container.textContent?.includes(
        BROADCAST_MOS_WORDS.needsConnection,
      ) === true,
  );
  expect(offlineMount.container.querySelector('[aria-busy="true"]')).toBeNull();
  act(() => {
    mounted?.unmount();
  });
  document.body.innerHTML = "";

  // 2. Online fetch failure shows Try again and recovers.
  let attempt = 0;
  globalThis.fetch = (async () => {
    attempt += 1;
    if (attempt === 1) return jsonResponse({ error: "unavailable" }, 503);
    return jsonResponse({
      config: {
        dialect: "mos_2_8_5",
        host: "10.0.0.88",
        lowerPort: 10540,
        upperPort: 10541,
        ncsId: "manent.ncs",
        mosId: "prompter.studio",
        allowedCidrs: [],
        enabled: true,
      },
      status: "live",
    });
  }) as unknown as typeof fetch;

  const retryMount = mountInProviders(
    <BroadcastGroup workspaceId="ws-non-owner" canChange={false} online />,
  );
  await until(
    () =>
      retryMount.container.textContent?.includes(
        BROADCAST_MOS_WORDS.couldNotLoad,
      ) === true,
  );
  const tryAgainBtn = Array.from(
    retryMount.container.querySelectorAll("button"),
  ).find((btn) => btn.textContent === BROADCAST_MOS_WORDS.tryAgain)!;
  await act(async () => {
    tryAgainBtn.click();
    await Promise.resolve();
  });
  await until(
    () =>
      retryMount.container.textContent?.includes(
        BROADCAST_MOS_WORDS.statusLive,
      ) === true,
  );
  expect(retryMount.container.textContent).toContain(
    BROADCAST_MOS_WORDS.statusOn,
  );
  expect(retryMount.container.querySelector("input")).toBeNull();

  // 3. Re-mounting same workspace while fetch fails shows cached fallback copy + last-seen data.
  act(() => {
    mounted?.unmount();
  });
  document.body.innerHTML = "";
  globalThis.fetch = (async () =>
    jsonResponse({ error: "unavailable" }, 503)) as unknown as typeof fetch;
  const cachedFailMount = mountInProviders(
    <BroadcastGroup workspaceId="ws-non-owner" canChange={false} online />,
  );
  await until(
    () =>
      cachedFailMount.container.textContent?.includes(
        BROADCAST_MOS_WORDS.couldNotLoadCached,
      ) === true,
  );
  expect(cachedFailMount.container.textContent).toContain(
    BROADCAST_MOS_WORDS.statusLive,
  );

  // 4. Non-owner with unconfigured workspace sees "Nothing is set up".
  act(() => {
    mounted?.unmount();
  });
  document.body.innerHTML = "";
  globalThis.fetch = (async () =>
    jsonResponse({ config: null, status: "off" })) as unknown as typeof fetch;
  const emptyMemberMount = mountInProviders(
    <BroadcastGroup
      workspaceId="ws-non-owner-empty"
      canChange={false}
      online
    />,
  );
  await until(
    () =>
      emptyMemberMount.container.textContent?.includes(
        BROADCAST_MOS_WORDS.nothingSetUp,
      ) === true,
  );
});

test("DetailsBroadcast toggles MOS when edit_rundowns + send_to_prompter are held and disables otherwise", async () => {
  let putBody: Record<string, unknown> | null = null;
  let caps: string[] = ["edit_rundowns", "send_to_prompter"];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith(`/api/prompter/${DOC_ID}/mos`) && method === "GET") {
      return jsonResponse({
        docId: DOC_ID,
        workspaceId: "",
        enabled: false,
        roSlug: "",
        configured: false,
        status: "off",
      });
    }
    if (url.endsWith("/api/workspaces/ws-1/mos") && method === "GET") {
      return jsonResponse({
        config: {
          dialect: "autoscript_winplus_ip",
          host: "10.0.0.42",
          lowerPort: 10540,
          upperPort: 10541,
          ncsId: "manent.ncs",
          mosId: "prompter.studio",
          allowedCidrs: [],
          enabled: true,
        },
        status: "waiting",
      });
    }
    if (url.endsWith("/api/docs/describe") && method === "POST") {
      return jsonResponse({ role: "edit", capabilities: caps });
    }
    if (url.endsWith(`/api/prompter/${DOC_ID}/mos`) && method === "PUT") {
      putBody = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      return jsonResponse({
        docId: DOC_ID,
        workspaceId: "ws-1",
        enabled: putBody.enabled,
        roSlug: DOC_ID,
        configured: true,
        status: putBody.enabled ? "live" : "off",
      });
    }
    return jsonResponse({ error: "not_found" }, 404);
  }) as unknown as typeof fetch;

  const enabledMount = mountInProviders(<DetailsBroadcast docId={DOC_ID} />);
  await until(
    () =>
      enabledMount.container.querySelector(
        '[data-tour="rundown:mos_toggle"]',
      ) !== null,
  );
  expect(enabledMount.container.textContent).toContain(
    BROADCAST_MOS_WORDS.rundownHeading,
  );
  expect(enabledMount.container.textContent).toContain(
    BROADCAST_MOS_WORDS.airWindowNote,
  );
  const toggle = enabledMount.container.querySelector<HTMLElement>(
    '[data-tour="rundown:mos_toggle"]',
  )!;
  expect(toggle.getAttribute("aria-disabled")).not.toBe("true");
  expect((toggle as HTMLButtonElement).disabled).toBeFalsy();

  await act(async () => {
    toggle.click();
    await Promise.resolve();
  });
  await until(() => putBody !== null);
  expect(putBody as Record<string, unknown> | null).toEqual({
    workspaceId: "ws-1",
    enabled: true,
  });
  await until(
    () =>
      enabledMount.container.textContent?.includes(
        BROADCAST_MOS_WORDS.statusLive,
      ) === true,
  );

  // Without send_to_prompter, switch is disabled.
  act(() => {
    mounted?.unmount();
  });
  document.body.innerHTML = "";
  caps = ["edit_rundowns"];
  const restrictedMount = mountInProviders(<DetailsBroadcast docId={DOC_ID} />);
  await until(
    () =>
      restrictedMount.container.querySelector(
        '[data-tour="rundown:mos_toggle"]',
      ) !== null,
  );
  const restrictedToggle = restrictedMount.container.querySelector<HTMLElement>(
    '[data-tour="rundown:mos_toggle"]',
  )!;
  expect(
    restrictedToggle.hasAttribute("data-disabled") ||
      restrictedToggle.getAttribute("aria-disabled") === "true",
  ).toBe(true);
});

test("DetailsBroadcast hides when workspace MOS is unconfigured for non-owners and links for owners", async () => {
  let wsRole: "owner" | "edit" = "edit";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith(`/api/prompter/${DOC_ID}/mos`)) {
      return jsonResponse({
        docId: DOC_ID,
        workspaceId: "",
        enabled: false,
        roSlug: "",
        configured: false,
        status: "off",
      });
    }
    if (url.endsWith("/api/workspaces/ws-1/mos")) {
      return jsonResponse({ config: null, status: "off" });
    }
    if (url.endsWith("/api/docs/describe")) {
      return jsonResponse({ role: wsRole, capabilities: ["edit_rundowns"] });
    }
    if (url.includes("/api/workspace/people")) {
      return jsonResponse({
        people: [{ userId: "ana", name: "Ana", role: wsRole }],
      });
    }
    return jsonResponse({ error: "not_found" }, 404);
  }) as unknown as typeof fetch;

  // Non-owner sees nothing when unconfigured.
  const memberMount = mountInProviders(<DetailsBroadcast docId={DOC_ID} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(memberMount.container.textContent).toBe("");
  act(() => {
    mounted?.unmount();
  });
  document.body.innerHTML = "";

  // Owner sees 1 muted link to Workspace settings → Broadcast.
  wsRole = "owner";
  const ownerMount = mountInProviders(<DetailsBroadcast docId={DOC_ID} />);
  await until(() => ownerMount.container.querySelector("a") !== null);
  const link = ownerMount.container.querySelector("a")!;
  expect(link.textContent).toBe(BROADCAST_MOS_WORDS.notSetUp);
  expect(link.getAttribute("href")).toBe("/w/ws-1/settings/broadcast");
});
