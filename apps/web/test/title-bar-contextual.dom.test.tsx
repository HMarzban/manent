import { withDom } from "@manent/testkit/dom";
import { COMMANDS, createCommandService } from "@manent/commands";
import type { CommandContext } from "@manent/commands";
import {
  SETTINGS,
  createMemoryBag,
  createSettingsStore,
} from "@manent/settings";
import {
  CommandsProvider,
  PROMPTER_WINDOW_WORDS,
  TooltipProvider,
} from "@manent/ui";
import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { closeBeside, openBeside } from "../src/beside/open-beside.ts";
import {
  closeInkCompileClient,
  openInkCompileClient,
} from "../src/ink/compile-client.ts";
import * as prompterSessionModule from "../src/prompter/prompter-session.ts";
import type { PrompterSnapshot } from "../src/prompter/prompter-session.ts";
import { PrompterTitleButton } from "../src/rundown/prompter-title-button.tsx";
import { setRundownView } from "../src/rundown/rundown-view-store.ts";
import type { RundownViewState } from "../src/rundown/rundown-view-store.ts";
import { BoardTitleBar } from "../src/screens/board/board-bars.tsx";
import { FormatReadout } from "../src/screens/document/format-readout.tsx";
import { InkPlayButton } from "../src/screens/document/ink-play-button.tsx";
import { InkProblemsReadout } from "../src/screens/document/ink-problems-readout.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { createShellDom } from "../src/shell/regions.tsx";
import { bindGuard } from "../src/state/guard.ts";
import { panelsActions } from "../src/state/panels.store.ts";
import {
  DOC_ID,
  click,
  nameOf,
  region,
  renderFrame,
  unmountFrame,
} from "./document-frame.fixtures.tsx";
import {
  createClock,
  createNavigation,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

withDom();

const REAL_PROMPTER_SESSION = { ...prompterSessionModule };

const BASE_PROMPTER: PrompterSnapshot = Object.freeze({
  online: true,
  canSend: true,
  synced: true,
  inFlightRows: new Set<string>(),
  waitingByDocId: new Map<string, number>(),
  operator: null,
  scroll: null,
  takingControl: false,
  isOperator: false,
  hasSentRow: false,
  activeRowId: null,
  activeRowSent: false,
});

let mockedPrompter: PrompterSnapshot = BASE_PROMPTER;
let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
    closeBeside();
    panelsActions.close("side");
    panelsActions.close("left");
  });
  root = null;
  unmountFrame();
  closeInkCompileClient(DOC_ID);
  setRundownView(DOC_ID, null);
  mockedPrompter = BASE_PROMPTER;
  mock.module(
    "../src/prompter/prompter-session.ts",
    () => REAL_PROMPTER_SESSION,
  );
  document.body.replaceChildren();
});

function baseContext(over: Partial<CommandContext> = {}): CommandContext {
  return {
    screen: "document",
    focus: "page",
    docOpen: true,
    role: "editor",
    online: true,
    platform: "mac",
    shell: "web",
    demo: false,
    signedIn: true,
    workspace: "writable",
    panelOpen: { left: false, side: false },
    historyPresent: true,
    format: "screenplay",
    rulerShown: false,
    layoutView: "page",
    spaceBeforeSet: false,
    zoom: null,
    zoomPercent: null,
    docKind: "script",
    projectKind: null,
    outlineStart: false,
    writing: null,
    material: null,
    rundown: null,
    prompter: null,
    inTrash: false,
    canDelete: false,
    focusMode: false,
    readingAloud: false,
    sprintRunning: false,
    production: null,
    ...over,
  };
}

function mountInContext(options: {
  context: CommandContext;
  format?: string;
  handlers?: Record<string, () => void>;
  element: React.ReactNode;
}) {
  const clock = createClock();
  const environment = testEnvironment({
    dom: createShellDom(document),
    now: clock.now,
    schedule: clock.schedule,
    frame: (fn) => clock.schedule(fn, 16),
  });
  bindGuard(environment.guard);
  const scriptBag = createMemoryBag({
    initial: options.format ? { "script.format": options.format } : {},
    writable: () => true,
  });
  const scriptStore = createSettingsStore({
    registry: SETTINGS,
    bags: {
      personal: createMemoryBag({ initial: {}, writable: () => true }),
      device: createMemoryBag({ initial: {}, writable: () => true }),
      script: scriptBag,
      project: null,
    },
    beforeWrite: () => {},
    deferRemote: (apply) => apply(),
    locked: () => false,
  });
  const base = testServices({
    userId: "you",
    environment,
    router: createNavigation({
      routeId: "/s/$docId",
      href: `/s/${DOC_ID}`,
      search: {},
    }).navigation,
  });
  const commands = createCommandService({
    commands: COMMANDS,
    handlers: options.handlers ?? {},
    context: () => options.context,
    settings: scriptStore,
    bindings: () => base.resolved.get().effective,
    onDisabled: () => {},
  });
  const services = {
    ...base,
    commands,
    openScriptStore: () => scriptStore,
  };
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  const rerender = (el: React.ReactNode) => {
    act(() => {
      root?.render(
        <EnvironmentProvider environment={environment}>
          <ServicesProvider services={services}>
            <CommandsProvider
              service={commands}
              resolved={base.resolved}
              platform="mac"
            >
              <TooltipProvider>{el}</TooltipProvider>
            </CommandsProvider>
          </ServicesProvider>
        </EnvironmentProvider>,
      );
    });
  };
  rerender(options.element);
  return { container, clock, commands, scriptStore, rerender };
}

test("standard screenplay has zero Play, Prompter, Format, or Ink problems chrome", async () => {
  const { container } = await renderFrame();
  const titleBar = region(container, "title_bar");
  const statusBar = region(container, "status_bar");
  expect([
    titleBar.querySelector('[data-tour="title:ink-play"]'),
    titleBar.querySelector('[data-tour="title:prompter"]'),
    statusBar.querySelector(".mn-tag"),
  ]).toEqual([null, null, null]);
});

test("InkPlayButton shows only for Ink, surfaces problem dot and sr-only count, and toggles aria-pressed", async () => {
  let playRuns = 0;
  const { container } = mountInContext({
    context: baseContext({ format: "ink" }),
    format: "ink",
    handlers: {
      "ink.play": () => {
        playRuns += 1;
        openBeside(DOC_ID, "ink_player", null);
      },
    },
    element: (
      <>
        <InkPlayButton docId={DOC_ID} />
        <InkProblemsReadout docId={DOC_ID} />
      </>
    ),
  });

  const btn = () =>
    container.querySelector(
      '[data-tour="title:ink-play"]',
    ) as HTMLButtonElement;
  expect(btn()).not.toBeNull();
  expect([
    btn().getAttribute("aria-pressed"),
    btn().querySelector(".mn-status-dot"),
    btn().getAttribute("aria-describedby"),
  ]).toEqual(["false", null, null]);

  const savedWorker: unknown = Reflect.get(globalThis, "Worker");
  Reflect.set(globalThis, "Worker", undefined);
  try {
    await act(async () => {
      const client = openInkCompileClient(DOC_ID);
      await client.compileNow("-> missing_knot\n");
    });
  } finally {
    Reflect.set(globalThis, "Worker", savedWorker);
  }

  const dot = btn().querySelector(".mn-status-dot");
  const descId = btn().getAttribute("aria-describedby");
  const srDesc = descId ? document.getElementById(descId)?.textContent : null;
  const readoutText = [...container.querySelectorAll("button")]
    .filter((b) => b !== btn())
    .map(nameOf);
  expect([
    dot?.className.includes("bg-attention"),
    srDesc,
    readoutText,
  ]).toEqual([true, "1 problem", ["1 problem"]]);

  await click(btn());
  expect([
    playRuns,
    btn().getAttribute("aria-pressed"),
    btn().querySelector(".mn-status-dot"),
  ]).toEqual([1, "true", null]);

  await click(btn());
  expect([
    btn().getAttribute("aria-pressed"),
    btn().querySelector(".mn-status-dot") !== null,
  ]).toEqual(["false", true]);
});

test("InkPlayButton also shows for Game Script, toggles aria-pressed for game_player, and never shows a compile problem dot", async () => {
  let playRuns = 0;
  const { container } = mountInContext({
    context: baseContext({ format: "game" }),
    format: "game",
    handlers: {
      "ink.play": () => {
        playRuns += 1;
        openBeside(DOC_ID, "game_player", null);
      },
    },
    element: <InkPlayButton docId={DOC_ID} />,
  });

  const btn = () =>
    container.querySelector(
      '[data-tour="title:ink-play"]',
    ) as HTMLButtonElement;
  expect(btn()).not.toBeNull();
  expect([
    btn().getAttribute("aria-pressed"),
    btn().querySelector(".mn-status-dot"),
    btn().getAttribute("aria-describedby"),
  ]).toEqual(["false", null, null]);

  await click(btn());
  expect([
    playRuns,
    btn().getAttribute("aria-pressed"),
    btn().querySelector(".mn-status-dot"),
  ]).toEqual([1, "true", null]);

  await click(btn());
  expect([
    btn().getAttribute("aria-pressed"),
    btn().querySelector(".mn-status-dot"),
  ]).toEqual(["false", null]);
});

function makeRundownView(
  rows: {
    id: string;
    docId: string | null;
    state: "on" | "changed" | null;
  }[],
): RundownViewState {
  return {
    ready: true,
    rundown: {
      version: 1,
      date: "2026-11-27",
      air: "20:00",
      targetSeconds: 1800,
      airWindowMinutes: 15,
      rows: rows.map((r, i) => ({
        id: r.id,
        kind: "story",
        title: `Story ${i + 1}`,
        docId: r.docId,
        header: null,
        numbered: true,
        writer: "",
        storyType: "",
        durationOverrideSeconds: null,
        prompter:
          r.state === null
            ? null
            : { state: r.state, sentAt: 1000, versionId: "v1", by: "you" },
      })),
    } as unknown as NonNullable<RundownViewState["rundown"]>,
    clock: null,
    onDevice: new Set(),
    access: "edit",
    people: [],
    projectTitle: "News",
    activeCell: null,
    selectedRowIds: new Set(),
    editingCell: false,
  };
}

test("PrompterTitleButton reflects idle, live, changed, operator, and controlling states and runs command on click", async () => {
  mock.module("../src/prompter/prompter-session.ts", () => ({
    ...REAL_PROMPTER_SESSION,
    usePrompterRuntime: () => mockedPrompter,
  }));

  // Hidden on standard script without prompter context
  const hidden = mountInContext({
    context: baseContext({ docKind: "script", prompter: null }),
    element: <PrompterTitleButton docId={DOC_ID} />,
  });
  expect(
    hidden.container.querySelector('[data-tour="title:prompter"]'),
  ).toBeNull();
  act(() => root?.unmount());

  let presentRuns = 0;
  const { container, rerender } = mountInContext({
    context: baseContext({ docKind: "rundown" }),
    handlers: {
      "view.presentOnPrompter": () => {
        presentRuns += 1;
      },
    },
    element: <PrompterTitleButton docId={DOC_ID} />,
  });

  const btn = () =>
    container.querySelector(
      '[data-tour="title:prompter"]',
    ) as HTMLButtonElement;
  const srStatus = () => {
    const id = btn().getAttribute("aria-describedby");
    return id ? (document.getElementById(id)?.textContent ?? null) : null;
  };
  const dotClass = () =>
    btn().querySelector(".mn-status-dot")?.className ?? null;

  // Idle
  expect([
    btn().hasAttribute("aria-pressed"),
    btn().getAttribute("data-active"),
    dotClass(),
    srStatus(),
  ]).toEqual([false, null, null, null]);

  // Live (all script rows on prompter)
  act(() => {
    setRundownView(
      DOC_ID,
      makeRundownView([
        { id: "r1", docId: "s1", state: "on" },
        { id: "r2", docId: null, state: null },
      ]),
    );
  });
  mockedPrompter = { ...BASE_PROMPTER, online: true, hasSentRow: true };
  rerender(<PrompterTitleButton docId={DOC_ID} />);
  expect([dotClass()?.includes("bg-ok"), srStatus()]).toEqual([
    true,
    PROMPTER_WINDOW_WORDS.prompterLive,
  ]);

  // Changed (2 script rows not "on")
  act(() => {
    setRundownView(
      DOC_ID,
      makeRundownView([
        { id: "r1", docId: "s1", state: "changed" },
        { id: "r2", docId: "s2", state: null },
        { id: "r3", docId: "s3", state: "on" },
      ]),
    );
  });
  rerender(<PrompterTitleButton docId={DOC_ID} />);
  expect([dotClass()?.includes("bg-attention"), srStatus()]).toEqual([
    true,
    PROMPTER_WINDOW_WORDS.prompterChanged(2),
  ]);

  // Another operator controlling
  mockedPrompter = {
    ...BASE_PROMPTER,
    online: true,
    hasSentRow: true,
    operator: {
      userId: "sam",
      name: "Sam",
      deviceId: "dev-2",
      since: 1000,
      expiresAt: 60_000,
    },
  };
  rerender(<PrompterTitleButton docId={DOC_ID} />);
  expect([
    btn().getAttribute("data-active"),
    dotClass()?.includes("bg-ok"),
    srStatus(),
  ]).toEqual([null, true, "Present on prompter · Sam controls the prompter"]);

  // Self controlling
  mockedPrompter = {
    ...BASE_PROMPTER,
    online: true,
    hasSentRow: true,
    isOperator: true,
  };
  rerender(<PrompterTitleButton docId={DOC_ID} />);
  expect([
    btn().getAttribute("data-active"),
    btn().className.includes("bg-selected"),
    dotClass()?.includes("bg-ok"),
    srStatus(),
  ]).toEqual(["true", true, true, PROMPTER_WINDOW_WORDS.prompterControlling]);

  await click(btn());
  expect(presentRuns).toBe(1);
});

test("FormatReadout is hidden for screenplay, shown for Ink/Game/Variety, and opens Details", async () => {
  const cases: readonly [
    NonNullable<CommandContext["format"]>,
    string | null,
  ][] = [
    ["screenplay", null],
    ["ink", "Ink"],
    ["game", "Game Script"],
    ["variety", "Variety"],
  ];

  for (const [format, expected] of cases) {
    const { container } = mountInContext({
      context: baseContext({ format }),
      format,
      element: <FormatReadout docId={DOC_ID} />,
    });
    const button = container.querySelector("button");
    if (expected === null) {
      expect(button).toBeNull();
    } else {
      expect(button?.querySelector(".mn-tag")?.textContent).toBe(expected);
      await click(button!);
      expect(panelsActions.get().side.tab).toBe("details");
      act(() => panelsActions.close("side"));
    }
    act(() => root?.unmount());
  }
});

test("BoardTitleBar hides duplicate Add storyline button when empty and uses wrapping min-h-titlebar", () => {
  const { container, rerender } = mountInContext({
    context: baseContext(),
    element: (
      <BoardTitleBar
        projectTitle="Harbour"
        seasons={[]}
        activeSeason={null}
        canEdit={true}
        showViewOnly={false}
        empty={true}
        onBack={() => {}}
        onSeasonChange={() => {}}
        onAddStoryline={() => {}}
      />
    ),
  });

  const bar = region(container, "title_bar");
  expect([
    bar.className.includes("min-h-titlebar"),
    bar.className.includes("flex-wrap"),
    [...bar.querySelectorAll("button")].map(nameOf),
  ]).toEqual([true, true, ["‹ Library", "Y"]]);

  rerender(
    <BoardTitleBar
      projectTitle="Harbour"
      seasons={[]}
      activeSeason={null}
      canEdit={true}
      showViewOnly={false}
      empty={false}
      onBack={() => {}}
      onSeasonChange={() => {}}
      onAddStoryline={() => {}}
    />,
  );

  expect([...bar.querySelectorAll("button")].map(nameOf)).toEqual([
    "‹ Library",
    "Add storyline",
    "Y",
  ]);
});
