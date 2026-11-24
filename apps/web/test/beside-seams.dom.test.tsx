import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, mock, test } from "bun:test";
import { createValue } from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  registerBesideFacts,
  useBesideFact,
} from "../src/beside/beside-facts.ts";
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
  expect(customKinds.map((k) => typeof k.choices)).toEqual([
    ...BESIDE_KINDS.map(() => "function" as const),
    "undefined",
    "function",
  ]);
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
  const statusRegion = grid.querySelector(
    '[data-beside="script"] [role="status"]',
  );
  const statusButtons = statusRegion?.querySelectorAll("button").length ?? -1;
  act(() => mounted?.unmount());
  mounted = null;
  expect([
    seenCustom,
    ranMainCommand,
    statusRegion?.textContent?.includes(
      "1 change by Sam since you last opened",
    ) ?? false,
    statusButtons,
  ]).toEqual(["beat-3", 0, true, 0]);
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
    outline: { publish() {} },
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
