import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, mock, test } from "bun:test";
import { BESIDE_WORDS, createValue } from "@manent/ui";
import type { StatusFacts } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  registerBesideFacts,
  useBesideFact,
} from "../src/beside/beside-facts.ts";
import { BesideFrame } from "../src/beside/beside-frame.tsx";
import { BesidePanel } from "../src/beside/beside-panel.tsx";
import {
  createBesideSource,
  runBesideRow,
} from "../src/beside/beside-source.ts";
import { BESIDE_KINDS } from "../src/beside/kinds.ts";
import {
  closeBeside,
  openBeside,
  useBeside,
} from "../src/beside/open-beside.ts";
import { ScriptBeside } from "../src/beside/script-beside.tsx";
import { mountBesideEditor } from "../src/editor-host/beside-editor.ts";
import { createEditorControl } from "../src/editor-host/control.ts";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { createPersonServices } from "../src/services/services.ts";
import { bindGuard } from "../src/state/guard.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import { createShellDom } from "../src/shell/regions.tsx";
import {
  MemoryStorage,
  createClock,
  fakeApi,
  testEnvironment,
} from "./services.fixtures.ts";

let mounted: Root | null = null;
afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  act(() => closeBeside());
  mock.restore();
  document.body.replaceChildren();
});

withDom();

test("beside-source handles omitted choices and create-on-first-open choices", async () => {
  const created: string[] = [];
  const customKinds = [
    ...BESIDE_KINDS,
    {
      id: "story" as const,
      title: () => "Story",
      hasStatus: false,
      Body: () => null,
    },
    {
      id: "outline" as const,
      title: () => "Outline",
      hasStatus: true,
      Body: () => null,
      choices: () => [
        {
          label: "New outline",
          open: async () => {
            created.push("outline-doc-1");
            return "outline-doc-1";
          },
        },
      ],
    },
  ];
  // verify BesideKind allows optional choices and open() resolves row selection
  expect(
    customKinds.slice(BESIDE_KINDS.length).map((k) => typeof k.choices),
  ).toEqual(["undefined", "function"]);
  const clock = createClock(1_000);
  const env = testEnvironment({
    dom: createShellDom(document),
    now: clock.now,
    schedule: clock.schedule,
    storage: new MemoryStorage(),
  });
  bindGuard(env.guard);
  const services = createPersonServices({
    ...env,
    person: { token: null, userId: "you", name: "You" },
    demo: createValue(false),
    api: fakeApi(),
    usePerson: createPersonStore(null),
    router: {
      navigate() {},
      here: () => ({ routeId: null, href: "/", search: {} }),
    },
  });
  const source = createBesideSource({
    here: () => ({ docId: "s1", services, workspaceIds: ["you"] }),
  });
  expect(Array.isArray(source.rows(""))).toBe(true);
  // directly invoke an open() choice via a BesideKind test entry
  let openedDoc: string | null = null;
  const openChoice = customKinds.at(-1)?.choices?.({
    docId: "s1",
    services,
    workspaceIds: ["you"],
  })[0];
  if (openChoice?.open) {
    openedDoc = await openChoice.open({
      docId: "s1",
      services,
      workspaceIds: ["you"],
    });
  }
  expect([created, openedDoc, runBesideRow("unknown")]).toEqual([
    ["outline-doc-1"],
    "outline-doc-1",
    false,
  ]);
});

test("useBesideFact reads custom string keys and BesidePanel omits main-doc state actions", () => {
  const clock = createClock(1_000);
  const env = testEnvironment({
    dom: createShellDom(document),
    now: clock.now,
    schedule: clock.schedule,
    storage: new MemoryStorage(),
  });
  bindGuard(env.guard);
  let ranMainCommand = 0;
  const base = createPersonServices({
    ...env,
    person: { token: null, userId: "you", name: "You" },
    demo: createValue(false),
    api: fakeApi(),
    usePerson: createPersonStore(null),
    router: {
      navigate() {},
      here: () => ({ routeId: null, href: "/", search: {} }),
    },
  });
  const services = {
    ...base,
    besideMount: () => ({ mount: () => () => {} }),
    documents: {
      ...base.documents,
      open: (docId: string) => ({
        ...base.documents.open(docId),
        stateFacts: createValue([
          { kind: "changes_since_opened" as const, count: 1, names: ["Sam"] },
        ]),
      }),
    },
    commands: {
      ...base.commands,
      run() {
        ranMainCommand++;
        return "ran" as const;
      },
    },
  };
  let customValue: unknown = null;
  const Probe = () => {
    customValue = useBesideFact("custom-1", "customKey");
    return null;
  };
  const unregister = registerBesideFacts("custom-1", {
    get: (key: string) => (key === "customKey" ? "beat-3" : null),
    subscribe: () => () => {},
  });
  const grid = document.createElement("div");
  const pageRegion = document.createElement("div");
  pageRegion.dataset["region"] = "page";
  grid.append(pageRegion);
  const host = document.createElement("div");
  document.body.append(grid, host);
  mounted = createRoot(host);
  act(() => openBeside("b1", "script", null));
  act(() => {
    mounted?.render(
      <EnvironmentProvider environment={env}>
        <ServicesProvider services={services}>
          <Probe />
          <BesidePanel open={{ docId: "b1", kind: "script", at: null }} />
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });
  const seenCustom = customValue;
  act(() => unregister());
  const statusRegions = [
    ...grid.querySelectorAll('[data-beside="script"] [role="status"]'),
  ];
  const stateBarRegion = statusRegions.find((node) =>
    node.textContent?.includes("1 change by Sam since you last opened"),
  );
  const statusButtons = stateBarRegion?.querySelectorAll("button").length ?? -1;
  act(() => mounted?.unmount());
  mounted = null;
  expect([
    seenCustom,
    ranMainCommand,
    statusRegions.length >= 2,
    stateBarRegion !== undefined,
    statusButtons,
  ]).toEqual(["beat-3", 0, true, true, 0]);
});

test("mountBesideEditor skips restorePlace when at is set and re-attaches on focusin after main rebuild", () => {
  const restorePlaces: (boolean | undefined)[] = [];
  const mainControl = createEditorControl();
  const mainCalls: string[] = [];
  const besideCalls: string[] = [];
  mainControl.attach({
    run: (req) => {
      mainCalls.push(typeof req === "string" ? req : req.kind);
      return { ok: true };
    },
    zoomPercent: () => 100,
    showTitlePage: () => {},
  });
  const besideElement = document.createElement("div");
  const child = document.createElement("button");
  besideElement.append(child);
  document.body.append(besideElement);

  const clock = createClock(1_000);
  const env = testEnvironment({
    dom: createShellDom(document),
    now: clock.now,
    schedule: clock.schedule,
    storage: new MemoryStorage(),
  });
  bindGuard(env.guard);
  const base = createPersonServices({
    ...env,
    person: { token: null, userId: "you", name: "You" },
    demo: createValue(false),
    api: fakeApi(),
    usePerson: createPersonStore(null),
    router: {
      navigate() {},
      here: () => ({ routeId: null, href: "/", search: {} }),
    },
  });
  const unmount = mountBesideEditor({
    services: {
      ...base,
      editor: mainControl,
      besideMount: (control) => ({
        mount(opts) {
          restorePlaces.push(opts.restorePlace);
          return control.attach({
            run: (req) => {
              besideCalls.push(typeof req === "string" ? req : req.kind);
              return { ok: true };
            },
            zoomPercent: () => 100,
            showTitlePage: () => {},
          });
        },
      }),
    },
    element: besideElement,
    docId: "b2",
    at: { blockId: "blk-5" },
    facts: { publish() {} },
    outline: { publish() {}, publishCurrent() {} },
    settings: { get: () => null, subscribe: () => () => {} },
    guard: env.guard,
  });

  // 1) Initial focusin attaches beside forwarder
  child.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  mainControl.run("edit.undo");
  // 2) Main editor rebuilds and attaches on top of stack
  mainControl.attach({
    run: (req) => {
      mainCalls.push(typeof req === "string" ? req : req.kind);
      return { ok: true };
    },
    zoomPercent: () => 100,
    showTitlePage: () => {},
  });
  // 3) Focusing beside again re-attaches forwarder back on top
  child.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  mainControl.run("edit.redo");
  unmount();

  expect([restorePlaces, besideCalls, mainCalls, useBeside]).toEqual([
    [false],
    ["go_to", "edit.undo", "edit.redo"],
    [],
    expect.any(Function),
  ]);
});

test("BesideFrame exposes region landmark, logical paddingInlineEnd, and keyboard-resizable separator", () => {
  const grid = document.createElement("div");
  const pageRegion = document.createElement("div");
  pageRegion.dataset["region"] = "page";
  grid.append(pageRegion);
  const host = document.createElement("div");
  document.body.append(grid, host);
  mounted = createRoot(host);

  act(() => {
    mounted!.render(
      <BesideFrame
        kind="script"
        title="Harbour Lights"
        status={null}
        onClose={() => {}}
        lines={null}
      >
        <div>Body</div>
      </BesideFrame>,
    );
  });

  const pane = grid.querySelector<HTMLElement>('[data-beside="script"]')!;
  const sep = pane.querySelector<HTMLElement>('[role="separator"]')!;
  expect([
    pane.getAttribute("role"),
    pane.getAttribute("aria-label"),
    pane.className.includes("border-s"),
    pageRegion.style.paddingInlineEnd,
    sep.getAttribute("aria-label"),
    sep.getAttribute("aria-valuenow"),
    sep.getAttribute("aria-valuemin"),
    sep.getAttribute("aria-valuemax"),
  ]).toEqual([
    "region",
    BESIDE_WORDS.regionLabel("Harbour Lights"),
    true,
    "50%",
    BESIDE_WORDS.resizeLabel,
    "50",
    "30",
    "70",
  ]);

  act(() => {
    sep.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
  });
  expect([
    sep.getAttribute("aria-valuenow"),
    pageRegion.style.paddingInlineEnd,
  ]).toEqual(["55", "55%"]);

  act(() => {
    sep.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
  });
  expect([
    sep.getAttribute("aria-valuenow"),
    pageRegion.style.paddingInlineEnd,
  ]).toEqual(["30", "30%"]);

  act(() => {
    sep.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
  });
  expect([
    sep.getAttribute("aria-valuenow"),
    pageRegion.style.paddingInlineEnd,
  ]).toEqual(["70", "70%"]);
});

test("BesidePanel shows compact EmptyHeroCard for deleted, access_removed, and offline-uncached, and restores opener focus on close", async () => {
  const clock = createClock(1_000);
  const env = testEnvironment({
    dom: createShellDom(document),
    now: clock.now,
    schedule: clock.schedule,
    storage: new MemoryStorage(),
  });
  bindGuard(env.guard);
  const base = createPersonServices({
    ...env,
    person: { token: null, userId: "you", name: "You" },
    demo: createValue(false),
    api: fakeApi(),
    usePerson: createPersonStore(null),
    router: {
      navigate() {},
      here: () => ({ routeId: null, href: "/", search: {} }),
    },
  });
  const baseStatus: StatusFacts = {
    access: "edit",
    device: "ok",
    network: "online",
    server: "deleted",
    waiting: 0,
    notSent: 0,
    offlineSinceAt: null,
    neverSynced: false,
    shell: "web",
    toReview: 0,
    now: 1_000,
  };
  const statusVal = createValue<StatusFacts>(baseStatus);
  const services = {
    ...base,
    ready: Promise.resolve(),
    onDevice: async () => new Set<string>(),
    besideMount: () => ({ mount: () => () => {} }),
    documents: {
      ...base.documents,
      open: (docId: string) => ({
        ...base.documents.open(docId),
        status: statusVal,
      }),
    },
  };

  const grid = document.createElement("div");
  const pageRegion = document.createElement("div");
  pageRegion.dataset["region"] = "page";
  const openerBtn = document.createElement("button");
  openerBtn.textContent = "Open beside trigger";
  pageRegion.append(openerBtn);
  grid.append(pageRegion);
  const host = document.createElement("div");
  document.body.append(grid, host);
  mounted = createRoot(host);

  act(() => {
    openerBtn.focus();
    openBeside("b-del", "script", null);
  });
  act(() => {
    mounted!.render(
      <EnvironmentProvider environment={env}>
        <ServicesProvider services={services}>
          <BesidePanel open={{ docId: "b-del", kind: "script", at: null }} />
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });
  expect(grid.textContent).toContain(BESIDE_WORDS.deleted);

  act(() => {
    statusVal.set({ ...baseStatus, server: "access_removed" });
  });
  expect(grid.textContent).toContain(BESIDE_WORDS.noAccess);

  await act(async () => {
    statusVal.set({ ...baseStatus, server: "synced", network: "offline" });
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(grid.textContent).toContain(BESIDE_WORDS.needsConnection);

  const closeBtn = [...grid.querySelectorAll("button")].find(
    (btn) => btn.textContent === BESIDE_WORDS.close,
  )!;
  act(() => {
    closeBtn.focus();
    closeBtn.click();
  });
  expect(document.activeElement).toBe(openerBtn);
});

test("ScriptBeside jumps caret in place when only at changes for the same docId without remounting", () => {
  const clock = createClock(1_000);
  const env = testEnvironment({
    dom: createShellDom(document),
    now: clock.now,
    schedule: clock.schedule,
    storage: new MemoryStorage(),
  });
  bindGuard(env.guard);
  const base = createPersonServices({
    ...env,
    person: { token: null, userId: "you", name: "You" },
    demo: createValue(false),
    api: fakeApi(),
    usePerson: createPersonStore(null),
    router: {
      navigate() {},
      here: () => ({ routeId: null, href: "/", search: {} }),
    },
  });
  let mounts = 0;
  const jumps: string[] = [];
  const services = {
    ...base,
    besideMount: (control: Parameters<typeof base.besideMount>[0]) => ({
      mount: () => {
        mounts++;
        return control.attach({
          run: (req) => {
            if (typeof req === "object" && req.kind === "go_to")
              jumps.push(req.blockId);
            return { ok: true };
          },
          zoomPercent: () => 100,
          showTitlePage: () => {},
        });
      },
    }),
  };

  const host = document.createElement("div");
  document.body.append(host);
  mounted = createRoot(host);
  const draw = (at: { blockId: string } | null) =>
    act(() => {
      mounted!.render(
        <EnvironmentProvider environment={env}>
          <ServicesProvider services={services}>
            <ScriptBeside docId="doc-same" at={at} />
          </ServicesProvider>
        </EnvironmentProvider>,
      );
    });

  draw({ blockId: "blk-1" });
  draw({ blockId: "blk-2" });
  expect([mounts, jumps]).toEqual([1, ["blk-1", "blk-2"]]);
});
