import { withDom } from "@manent/testkit/dom";
import { afterEach, describe, expect, test } from "bun:test";
import { createMemoryBag } from "@manent/settings";
import {
  DIALOG_WORDS,
  SELECTION_WORDS,
  SHARING_WORDS,
  createValue,
} from "@manent/ui";
import type { StatusFacts } from "@manent/ui";
import type { SignInChoice } from "@manent/sync-protocol";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { DocumentServices } from "../src/services/ports.ts";
import { ShareDialog } from "../src/sharing/share-dialog.tsx";
import type { ShareAccess } from "../src/sharing/share-requests.ts";
import { shareHeld } from "../src/sharing/share-store.ts";
import { dialogActions } from "../src/state/dialog.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import { testEnvironment, testServices } from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

withDom();

const NOW = 1_764_000_000_000;
const originalFetch = globalThis.fetch;

let mounted: Root | null = null;

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await act(async () => {
    dialogActions.close();
    mounted?.unmount();
  });
  mounted = null;
  document.body.replaceChildren();
});

const ONLINE_SYNCED: StatusFacts = Object.freeze({
  access: "edit",
  device: "ok",
  network: "online",
  server: "synced",
  waiting: 0,
  notSent: 0,
  offlineSinceAt: null,
  neverSynced: false,
  shell: "web",
  toReview: 0,
  now: NOW,
});

function fakeDocument(
  statusOverrides: Partial<StatusFacts> = {},
): DocumentServices {
  const status = createValue<StatusFacts>({
    ...ONLINE_SYNCED,
    ...statusOverrides,
  });
  return {
    status,
    waitingByScene: createValue([]),
    stateFacts: createValue([]),
    people: createValue([
      { userId: "dana", name: "Dana Reyes", initials: "DR", colour: 3 },
    ]),
    viewers: createValue(0),
    scriptBag: createMemoryBag({ initial: {}, writable: () => true }),
    exportJson: () => ({}),
    subscribeSaved: () => () => {},
  } as unknown as DocumentServices;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function mountShareDialog(options: {
  docId: string;
  userId: string;
  status?: Partial<StatusFacts>;
}): Promise<void> {
  const environment = testEnvironment({ now: () => NOW });
  bindGuard(environment.guard);
  const services = testServices({ userId: options.userId, environment });
  const doc = fakeDocument(options.status);
  const rootRoute = createRootRoute({
    component: () => (
      <ServicesProvider services={services}>
        <ShareDialog docId={options.docId} doc={doc} />
      </ServicesProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  mounted = createRoot(container);
  await act(async () => {
    dialogActions.open("share");
    mounted?.render(
      <EnvironmentProvider environment={environment}>
        <RouterProvider router={router} />
      </EnvironmentProvider>,
    );
  });
}

async function flushInAct(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

function shareDialog(): HTMLElement {
  const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
  if (dialog === null) throw new Error("expected Share dialog to be open");
  return dialog;
}

const OWNER_ACCESS: ShareAccess = {
  people: [
    {
      userId: "dana",
      name: "Dana Reyes",
      role: "owner",
      groupId: null,
      lastActiveAt: null,
    },
    {
      userId: "leo",
      name: "Leo Marsh",
      role: "view",
      groupId: null,
      lastActiveAt: NOW - 14 * 60_000,
    },
  ],
  groups: [{ groupId: "room", role: "edit" }],
  links: [],
};

const CHOICES: readonly SignInChoice[] = [
  { userId: "dana", name: "Dana Reyes", title: "Writer", registered: true },
  { userId: "leo", name: "Leo Marsh", title: "Producer", registered: true },
  { userId: "samira", name: "Samira Patel", title: "Editor", registered: true },
];

describe("ShareDialog", () => {
  test("renders matching loading skeleton while access is pending", async () => {
    const docId = "share-doc-loading";
    shareHeld("dana", docId).access.set(null);
    let resolveAccess!: (response: Response) => void;
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/share/people")) {
        return new Promise<Response>((resolve) => {
          resolveAccess = resolve;
        });
      }
      return Promise.resolve(jsonResponse({ choices: [] }));
    }) as typeof fetch;

    await mountShareDialog({ docId, userId: "dana" });

    const dialog = shareDialog();
    expect(dialog.textContent).toContain(SELECTION_WORDS.share);
    const busy = dialog.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy?.querySelector(".mn-table")).not.toBeNull();
    expect(busy?.querySelectorAll('[aria-hidden="true"]').length).toBe(3);

    // Footer outline close button precedes the top-right absolute icon close button
    const closeButtons = [...dialog.querySelectorAll("button")].filter(
      (btn) =>
        btn.getAttribute("aria-label") === SHARING_WORDS.close ||
        btn.textContent?.trim() === SHARING_WORDS.close,
    );
    expect(closeButtons.length).toBe(2);
    expect(closeButtons[0]?.textContent?.trim()).toBe(SHARING_WORDS.close);
    expect(closeButtons[1]?.getAttribute("aria-label")).toBe(
      SHARING_WORDS.close,
    );
    expect(closeButtons[1]?.classList.contains("absolute")).toBe(true);

    await act(async () => {
      resolveAccess(jsonResponse(OWNER_ACCESS));
    });
  });

  test("owner view renders summary, invite bar, mn-table people/group rows, link toggle, and footer", async () => {
    const docId = "share-doc-owner";
    shareHeld("dana", docId).access.set(null);
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/share/people")) {
        return Promise.resolve(jsonResponse(OWNER_ACCESS));
      }
      if (url.includes("/api/sign-in")) {
        return Promise.resolve(jsonResponse({ choices: CHOICES }));
      }
      return Promise.resolve(jsonResponse({}));
    }) as typeof fetch;

    await mountShareDialog({ docId, userId: "dana" });
    await flushInAct();
    await until(
      () =>
        shareDialog().textContent?.includes(SHARING_WORDS.summary(2, false)) ??
        false,
    );
    await flushInAct();

    const dialog = shareDialog();
    expect(dialog.textContent).toContain(SHARING_WORDS.summary(2, false));

    // AddRow picker is present and Add button starts disabled
    const addTrigger = dialog.querySelector(
      `[aria-label="${SHARING_WORDS.addPlaceholder}"]`,
    );
    expect(addTrigger).not.toBeNull();
    const addButton = [...dialog.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === SHARING_WORDS.add,
    );
    expect(addButton?.disabled).toBe(true);

    // PeopleList uses .mn-table with role="list" and ordered listitems
    const list = dialog.querySelector<HTMLElement>('[role="list"]');
    expect(list).not.toBeNull();
    expect(list?.classList.contains("mn-table")).toBe(true);
    const items = [...(list?.querySelectorAll('[role="listitem"]') ?? [])];
    expect(items.length).toBe(3);
    expect(items[0]?.getAttribute("aria-posinset")).toBe("1");
    expect(items[0]?.textContent).toContain("Dana Reyes");
    expect(items[0]?.textContent).toContain(SHARING_WORDS.roles.owner);
    expect(items[0]?.querySelector('[role="combobox"]')).toBeNull();
    const ownerBadge = [...(items[0]?.querySelectorAll("span") ?? [])].find(
      (span) =>
        span.children.length === 0 &&
        span.textContent === SHARING_WORDS.roles.owner,
    );
    expect(ownerBadge?.className).toContain("rounded-micro");
    expect(ownerBadge?.className).not.toContain("rounded-full");
    expect(
      items[0]?.querySelector(".mn-avatar")?.getAttribute("data-who"),
    ).toBe("3");

    // E2E selector contract: any div/li inside dialog containing "Leo Marsh" has Leo's RoleSelect as its first combobox
    const leoDivs = [...dialog.querySelectorAll("li, div")].filter((el) =>
      el.textContent?.includes("Leo Marsh"),
    );
    expect(leoDivs.length).toBeGreaterThan(0);
    for (const el of leoDivs) {
      const firstCombo = el.querySelector('[role="combobox"]');
      expect(firstCombo).not.toBeNull();
      expect(firstCombo?.textContent).toContain(SHARING_WORDS.roles.view);
    }

    // Group row renders with formatted group label and Remove button
    expect(items[2]?.textContent).toContain(
      SHARING_WORDS.groupRow("Room", SHARING_WORDS.roles.edit, 0),
    );
    expect(
      items[2]?.querySelector(
        `button[aria-label="${SHARING_WORDS.removeName("Room")}"]`,
      ),
    ).not.toBeNull();

    // LinkGroup switch starts off and expands link configuration when toggled on
    const linkSwitch = dialog.querySelector<HTMLElement>('[role="switch"]');
    expect(linkSwitch).not.toBeNull();
    expect(linkSwitch?.getAttribute("aria-checked")).toBe("false");
    const linkLabel = dialog.querySelector("label");
    expect(linkLabel?.textContent).toBe(SHARING_WORDS.anyoneWithTheLink);
    const labelTargetId = linkLabel?.getAttribute("for") ?? "";
    expect(labelTargetId).not.toBe("");
    expect(document.getElementById(labelTargetId)).not.toBeNull();
    expect(dialog.textContent).not.toContain(SHARING_WORDS.copyLink);

    await act(async () => {
      linkSwitch?.click();
    });
    expect(linkSwitch?.getAttribute("aria-checked")).toBe("true");
    expect(dialog.textContent).toContain(SHARING_WORDS.copyLink);
    expect(dialog.textContent).toContain(
      DIALOG_WORDS.disabledLine(
        SHARING_WORDS.copyLink,
        SHARING_WORDS.needsRole,
      ),
    );

    // Footer has Send a draft to read… + explanation + Close
    const sendButton = [...dialog.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(SHARING_WORDS.sendDraft),
    );
    expect(sendButton).not.toBeNull();
    expect(sendButton?.getAttribute("aria-disabled")).toBeNull();
    expect(dialog.textContent).toContain(SHARING_WORDS.sendDifference);
  });

  test("owner view with active link shows expiry metadata and Turn off link", async () => {
    const docId = "share-doc-active-link";
    shareHeld("dana", docId).access.set(null);
    const withLink: ShareAccess = {
      ...OWNER_ACCESS,
      links: [
        { id: "link-1", role: "view", expiresAt: null, createdAt: NOW - 1000 },
      ],
    };
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/share/people")) {
        return Promise.resolve(jsonResponse(withLink));
      }
      return Promise.resolve(jsonResponse({ choices: CHOICES }));
    }) as typeof fetch;

    await mountShareDialog({ docId, userId: "dana" });
    await flushInAct();
    await until(
      () =>
        shareDialog().textContent?.includes(SHARING_WORDS.summary(2, true)) ??
        false,
    );
    await flushInAct();

    const dialog = shareDialog();
    expect(dialog.textContent).toContain(SHARING_WORDS.neverExpires);
    expect(dialog.textContent).toContain(SHARING_WORDS.turnOffLink);
    const linkSwitch = dialog.querySelector<HTMLElement>('[role="switch"]');
    expect(linkSwitch?.getAttribute("aria-checked")).toBe("true");
  });

  test("opening Share for the owner places the add picker first in focus order ahead of the top-right close button", async () => {
    const docId = "share-doc-initial-focus";
    shareHeld("dana", docId).access.set(OWNER_ACCESS);
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/share/people")) {
        return Promise.resolve(jsonResponse(OWNER_ACCESS));
      }
      return Promise.resolve(jsonResponse({ choices: CHOICES }));
    }) as typeof fetch;

    await mountShareDialog({ docId, userId: "dana" });
    await flushInAct();

    const dialog = shareDialog();
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    const addPicker = dialog.querySelector<HTMLElement>(
      `[aria-label="${SHARING_WORDS.addPlaceholder}"]`,
    );
    const topRightClose = dialog.querySelector<HTMLElement>(
      `button[aria-label="${SHARING_WORDS.close}"]`,
    );
    expect(addPicker).not.toBeNull();
    expect(topRightClose).not.toBeNull();
    expect(focusable[0]?.getAttribute("aria-label")).toBe(
      SHARING_WORDS.addPlaceholder,
    );
    expect(focusable[0] === addPicker).toBe(true);
    expect(focusable[0] === topRightClose).toBe(false);
    expect(focusable.at(-1) === topRightClose).toBe(true);
  });

  test("turning off an active link collapses the link card even after it was toggled open", async () => {
    const docId = "share-doc-turn-off-collapse";
    shareHeld("dana", docId).access.set(OWNER_ACCESS);
    const withLink: ShareAccess = {
      ...OWNER_ACCESS,
      links: [
        { id: "link-1", role: "view", expiresAt: null, createdAt: NOW - 1000 },
      ],
    };
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url.includes("/api/share/revoke-link") ||
        url.includes("/api/share/people")
      ) {
        return Promise.resolve(jsonResponse(OWNER_ACCESS));
      }
      return Promise.resolve(jsonResponse({ choices: CHOICES }));
    }) as typeof fetch;

    await mountShareDialog({ docId, userId: "dana" });
    await flushInAct();

    const dialog = shareDialog();
    const linkSwitch = dialog.querySelector<HTMLElement>('[role="switch"]');
    await act(async () => {
      linkSwitch?.click();
    });
    expect(linkSwitch?.getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      shareHeld("dana", docId).access.set(withLink);
    });
    const turnOffButton = [...dialog.querySelectorAll("button")].find(
      (btn) => btn.textContent?.trim() === SHARING_WORDS.turnOffLink,
    );
    expect(turnOffButton).not.toBeNull();

    await act(async () => {
      turnOffButton?.click();
    });
    await flushInAct();

    expect(linkSwitch?.getAttribute("aria-checked")).toBe("false");
    expect(dialog.textContent).not.toContain(SHARING_WORDS.copyLink);
  });

  test("non-owner view is read-only without invite bar, link card, or Send draft", async () => {
    const docId = "share-doc-non-owner";
    shareHeld("leo", docId).access.set(null);
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/share/people")) {
        return Promise.resolve(jsonResponse(OWNER_ACCESS));
      }
      return Promise.resolve(jsonResponse({ choices: [] }));
    }) as typeof fetch;

    await mountShareDialog({ docId, userId: "leo" });
    await flushInAct();
    await until(
      () =>
        shareDialog().textContent?.includes(SHARING_WORDS.ownerOnly) ?? false,
    );
    await flushInAct();

    const dialog = shareDialog();
    expect(dialog.textContent).toContain(SHARING_WORDS.ownerOnly);
    expect(dialog.querySelector(".mn-table")).not.toBeNull();
    expect(dialog.querySelector('[role="combobox"]')).toBeNull();
    expect(dialog.querySelector('[role="switch"]')).toBeNull();
    expect(dialog.querySelector('[data-tour="workspace:can_also"]')).toBeNull();
    expect(dialog.textContent).not.toContain(SHARING_WORDS.sendDraft);
    expect(dialog.textContent).not.toContain(SHARING_WORDS.remove);
  });

  test("offline owner view shows connection notice, cached list, and disabled Send draft", async () => {
    const docId = "share-doc-offline";
    shareHeld("dana", docId).access.set(OWNER_ACCESS);

    await mountShareDialog({
      docId,
      userId: "dana",
      status: { network: "offline" },
    });

    const dialog = shareDialog();
    expect(dialog.textContent).toContain(SHARING_WORDS.needsConnection);
    expect(dialog.querySelector(".mn-table")).not.toBeNull();
    expect(dialog.textContent).toContain("Dana Reyes");
    expect(dialog.textContent).toContain("Leo Marsh");
    expect(dialog.querySelector('[role="combobox"]')).toBeNull();
    expect(dialog.querySelector('[role="switch"]')).toBeNull();

    const sendButton = [...dialog.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(SHARING_WORDS.sendDraft),
    );
    expect(sendButton?.getAttribute("aria-disabled")).toBe("true");
    expect(dialog.textContent).toContain(
      SHARING_WORDS.sendDraftNeedsConnection,
    );
  });

  test("never-synced document shows sign-in notice only", async () => {
    const docId = "share-doc-sign-in";
    shareHeld("dana", docId).access.set(null);

    await mountShareDialog({
      docId,
      userId: "dana",
      status: { neverSynced: true },
    });

    const dialog = shareDialog();
    expect(dialog.textContent).toContain(SHARING_WORDS.signIn);
    expect(dialog.querySelector(".mn-table")).toBeNull();
    expect(dialog.querySelector('[role="switch"]')).toBeNull();
    expect(dialog.textContent).not.toContain(SHARING_WORDS.sendDraft);
  });
});
