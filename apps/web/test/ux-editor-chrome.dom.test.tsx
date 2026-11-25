import { withDom } from "@manent/testkit/dom";
import { createMemoryBag } from "@manent/settings";
import {
  DOCUMENT_WORDS,
  FindBar,
  LIBRARY_WORDS,
  StateBar,
  WRITING_WORDS,
  createValue,
  stateBarLines,
} from "@manent/ui";
import type { StateFact } from "@manent/ui";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { productionFacts } from "../src/production/state-facts.ts";
import { DocumentFrame } from "../src/screens/document/document-screen.tsx";
import { PageReadout } from "../src/screens/document/status-bar.tsx";
import { isStatusSettled } from "../src/screens/document/status-writer.ts";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type {
  DocumentServices,
  PersonServices,
} from "../src/services/ports.ts";
import { writePerson } from "../src/session.ts";
import { AppShell, ScreenArea } from "../src/shell/app-shell.tsx";
import { FactsContext } from "../src/state/bridge-contexts.ts";
import { createFactsStore } from "../src/state/facts.store.ts";
import { bindGuard } from "../src/state/guard.ts";
import { materialActions } from "../src/state/material.store.ts";
import type { PersonPresent } from "../src/state/people.store.ts";
import {
  DOC_ID,
  NEW_SCRIPT,
  buttonNamed,
  region,
  renderFrame,
  unmountFrame,
} from "./document-frame.fixtures.tsx";
import {
  MemoryStorage,
  createNavigation,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

let frameMounted = false;
let extraRoot: Root | null = null;

afterEach(() => {
  if (frameMounted) {
    unmountFrame();
    frameMounted = false;
  }
  if (extraRoot !== null) {
    act(() => extraRoot?.unmount());
    extraRoot = null;
  }
  document.body.replaceChildren();
});

test("WRITING_WORDS.switchLabel omits raw Unicode caret", () => {
  expect(WRITING_WORDS.switchLabel("For everyone")).toBe(
    "Writing: For everyone",
  );
  expect(WRITING_WORDS.switchLabel("Privately")).not.toContain("▾");
});

test("StateBar renders recall chip/uppercase, Issue before Recall, Over attention, and left-aligns solo scene_writer", () => {
  const host = document.createElement("div");
  document.body.append(host);
  extraRoot = createRoot(host);

  const recallWithRevision = stateBarLines([
    {
      kind: "recall",
      colour: "blue",
      name: "Blue",
      at: "Yesterday 06:11",
      people: 4,
    },
    {
      kind: "revision",
      colour: "pink",
      name: "Pink",
      started: "16 Nov 2026",
      pages: 3,
    },
  ]);
  expect(recallWithRevision.left).toMatchObject({
    sentence: "BLUE issued Yesterday 06:11 to 4 people",
    chip: "blue",
    actions: [
      { label: "Issue Pink…", commandId: "production.issue" },
      { label: "Recall Blue…", commandId: "production.recall" },
    ],
  });

  // Over target renders attention span without turning Air/Target amber
  const overTiming = stateBarLines([
    { kind: "rundown_timing", air: "22:00", target: "42:00", over: "0:46" },
  ]);
  act(() => {
    extraRoot!.render(
      <StateBar
        left={overTiming.left}
        right={null}
        run={() => {}}
        registered={() => true}
      />,
    );
  });
  const attentionSpan = host.querySelector(".text-attention");
  expect(attentionSpan?.textContent).toBe("Over 0:46");

  // Solo scene_writer renders in the left slot instead of floating behind an empty left div
  const soloWriter = stateBarLines([
    { kind: "scene_writer", name: "Sam Okafor" },
  ]);
  act(() => {
    extraRoot!.render(
      <StateBar
        left={soloWriter.left}
        right={soloWriter.right}
        run={() => {}}
        registered={() => true}
      />,
    );
  });
  const bar = host.querySelector('[data-tour="state_bar"]')!;
  expect(bar.children[0]?.textContent).toBe("Sam Okafor is writing this scene");
  expect(bar.children[1]?.textContent).toBe("");
});

test("productionFacts omits recall and revision for comment/view roles so role_comment is never shadowed", () => {
  const lockedState = {
    docId: "doc-1",
    baseline: null,
    state: {
      v: 1 as const,
      docId: "doc-1",
      headSeq: 2,
      locked: true,
      lockLevel: 1,
      lockedOn: "2026-11-15",
      numbering: "suffix" as const,
      colourOrder: ["white", "blue", "pink"],
      anchors: [],
      sceneNumbers: [],
      sets: [
        {
          setId: "s1",
          ordinal: 1,
          name: "Blue",
          colour: "blue",
          mark: "*",
          fullDraft: false,
          startedAt: 1_000,
          issuedAt: 2_000,
          issuedOn: "2026-11-15",
          issuedByName: "Ana",
          recalledAt: null,
          baselineVersionId: "v0",
          issuedVersionId: "v1",
          engineVersion: 1,
          blocks: [],
        },
        {
          setId: "s2",
          ordinal: 2,
          name: "Pink",
          colour: "pink",
          mark: "**",
          fullDraft: false,
          startedAt: 3_000,
          issuedAt: null,
          issuedOn: null,
          issuedByName: null,
          recalledAt: null,
          baselineVersionId: "v1",
          issuedVersionId: null,
          engineVersion: 1,
          blocks: [],
        },
      ],
      issues: [
        {
          issueId: "i1",
          setId: "s1",
          kind: "issue" as const,
          versionId: "v1",
          issuedAt: 2_000,
          issuedOn: "2026-11-15",
          issuedByName: "Ana",
          recipientUserIds: ["ana", "sam"],
          pages: ["1", "2"],
          memo: "",
          files: [],
          tint: false,
          what: "changed" as const,
        },
      ],
    },
    cachedAt: 3_000,
  };
  const editorFacts = productionFacts(
    lockedState,
    4_000,
    2,
    "collated",
    () => "2026-11-16",
    true,
  );
  expect(editorFacts.map((f) => f.kind)).toEqual(["recall", "revision"]);

  const commenterFacts = productionFacts(
    lockedState,
    4_000,
    2,
    "collated",
    () => "2026-11-16",
    false,
  );
  expect(commenterFacts).toEqual([]);
});

test("Share button is demoted for commenter, Details Script settings starts collapsed, and Ink Line readout renders in StatusBar", async () => {
  const frame = await renderFrame({
    status: { ...NEW_SCRIPT, neverSynced: false, access: "comment" },
  });
  frameMounted = true;

  const shareBtn = buttonNamed(region(frame.container, "title_bar"), "Share");
  expect(shareBtn.className).toContain("text-fg-muted");
  expect(shareBtn.className).not.toContain("border-border");

  expect(
    isStatusSettled({ ...NEW_SCRIPT, neverSynced: false, server: "syncing" }),
  ).toBe(false);
  expect(
    isStatusSettled({ ...NEW_SCRIPT, neverSynced: false, server: "synced" }),
  ).toBe(true);

  // StatusBar separates MessageSlot with a hairline
  const statusRegion = region(frame.container, "status_bar");
  expect(
    statusRegion.querySelector(".border-s.border-line.ps-2"),
  ).not.toBeNull();

  // Opening Details via side panel shows collapsed Script settings with concise summary
  await act(async () => {
    frame.services.commands.run("view.sidePanel", "control");
    await Promise.resolve();
  });
  const sideRegion = region(frame.container, "side_panel");
  const settingsToggle = buttonNamed(
    sideRegion,
    DOCUMENT_WORDS.scriptSettingsHeading,
  );
  expect(settingsToggle.getAttribute("aria-expanded")).toBe("false");
  expect(sideRegion.textContent).toContain("Screenplay · US Letter");

  // Focusing via keyboard Tab keeps Script settings collapsed; doc.scriptSettings expands it
  act(() => settingsToggle.focus());
  expect(settingsToggle.getAttribute("aria-expanded")).toBe("false");
  await act(async () => {
    frame.services.commands.run("doc.scriptSettings", "control");
    await Promise.resolve();
  });
  expect(settingsToggle.getAttribute("aria-expanded")).toBe("true");
});

test("PageReadout shows Ink Line N when unpaged and Ink lines are mounted", () => {
  const environment = testEnvironment();
  const facts = createFactsStore({
    guard: environment.guard,
    frame: (fn) => {
      fn();
      return () => {};
    },
  });
  const page = document.createElement("div");
  page.setAttribute("data-region", "page");
  const line1 = document.createElement("p");
  line1.setAttribute("data-type", "ink_line");
  line1.setAttribute("data-id", "ink-b1");
  const line2 = document.createElement("p");
  line2.setAttribute("data-type", "ink_line");
  line2.setAttribute("data-id", "ink-b2");
  page.append(line1, line2);
  const host = document.createElement("div");
  document.body.append(page, host);
  extraRoot = createRoot(host);
  act(() => {
    facts.writer.publish({
      page: null,
      pageCount: null,
      blockId: "ink-b2",
    });
    extraRoot!.render(
      <EnvironmentProvider environment={environment}>
        <FactsContext value={facts.selectors}>
          <PageReadout />
        </FactsContext>
      </EnvironmentProvider>,
    );
  });
  expect(host.querySelector('[data-tour="status:page"]')?.textContent).toBe(
    "Line 2",
  );
});

test("FindBar uses InputGroup with leading SearchIcon and py-1.5 clearance", () => {
  const host = document.createElement("div");
  document.body.append(host);
  extraRoot = createRoot(host);
  act(() => {
    extraRoot!.render(
      <FindBar
        find=""
        onFindChange={() => {}}
        count={0}
        current={null}
        focusKey={0}
        replaceable={false}
        onStep={() => {}}
        onReplace={() => {}}
        onReplaceAll={() => {}}
        onClose={() => {}}
      />,
    );
  });
  const bar = host.querySelector('[role="search"]')!;
  expect(bar.className).toContain("py-1.5");
  expect(bar.querySelector('[data-slot="input-group"]')).not.toBeNull();
  expect(
    bar.querySelector('[data-slot="input-group-addon"] svg'),
  ).not.toBeNull();
});

test("browser-only session opening an absent docId renders EmptyHeroCard with Choose a person and Back to Library", async () => {
  const tabStorage = new MemoryStorage();
  writePerson(tabStorage, { token: null, userId: "you", name: "You" });
  const environment = testEnvironment({ tabStorage });
  bindGuard(environment.guard);
  const nav = createNavigation({
    routeId: "/s/$docId",
    href: `/s/${DOC_ID}`,
    search: {},
  }).navigation;
  const base = testServices({ userId: "you", environment, router: nav });
  const doc: DocumentServices = {
    status: createValue({ ...NEW_SCRIPT, neverSynced: true }),
    waitingByScene: createValue<readonly { scene: string; count: number }[]>(
      [],
    ),
    stateFacts: createValue<readonly StateFact[]>([]),
    people: createValue<readonly PersonPresent[]>([]),
    viewers: createValue(0),
    scriptBag: createMemoryBag({ initial: {}, writable: () => true }),
    material: materialActions,
  };
  const services: PersonServices = {
    ...base,
    library: {
      ...base.library,
      documentTitle: () => createValue(null),
      docKindOf: () => createValue(null),
    },
    documents: { open: () => doc, close: () => {} },
  };

  const rootRoute = createRootRoute({
    component: () => (
      <ServicesProvider services={services}>
        <AppShell>
          <ScreenArea>
            <DocumentFrame docId={DOC_ID} />
          </ScreenArea>
        </AppShell>
      </ServicesProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: `/s/${DOC_ID}`,
        component: () => null,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: [`/s/${DOC_ID}`] }),
  });
  await router.load();

  const host = document.createElement("div");
  document.body.append(host);
  extraRoot = createRoot(host);
  await act(async () => {
    extraRoot!.render(
      <EnvironmentProvider environment={environment}>
        <RouterProvider router={router} />
      </EnvironmentProvider>,
    );
    await Promise.resolve();
  });

  expect(host.textContent).toContain(LIBRARY_WORDS.notOnDevice);
  expect(host.textContent).toContain(WRITING_WORDS.choosePerson);
  expect(host.textContent).toContain(WRITING_WORDS.backToLibrary);
});
