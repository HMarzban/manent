import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { COMMANDS } from "@manent/commands";
import type { CommandContext } from "@manent/commands";
import { SHOW_COLUMNS } from "@manent/schema";
import type { RundownJSON } from "@manent/schema";
import type {
  RestoreScopeBody,
  VersionContent,
  VersionItem,
} from "@manent/sync-protocol";
import {
  CommandsProvider,
  HISTORY_WORDS,
  RUNDOWN_HISTORY_WORDS,
  SettingsProvider,
  TimingProvider,
  createValue,
} from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { HistoryRow, HistorySource } from "../src/history/source.ts";
import { buildRundownClock } from "../src/rundown/rundown-access.ts";
import type { RundownAccess } from "../src/rundown/rundown-access.ts";
import { setRundownView } from "../src/rundown/rundown-view-store.ts";
import { HistoryVersions } from "../src/screens/document/history-versions.tsx";
import { openRundownRestore } from "../src/screens/document/history-rundown-rows.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import type { ProjectKind } from "../src/services/ports.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { historyActions } from "../src/state/history.store.ts";
import { testEnvironment, testServices } from "./services.fixtures.ts";
import { until } from "./sync.fixtures.ts";

withDom();
bindGuard(createGuard({ flavour: "test" }));

const DOC_ID = "66666666-6666-4666-8666-666666666666";
const ROW_H = "77777777-7777-4777-8777-777777777770";
const ROW_A = "77777777-7777-4777-8777-777777777771";
const ROW_B = "77777777-7777-4777-8777-777777777772";
const ROW_C = "77777777-7777-4777-8777-777777777773";
const ROW_D = "77777777-7777-4777-8777-777777777774";

const AIR_AT = new Date(2026, 10, 17, 23, 35, 0).getTime();
const IN_AIR_WINDOW_MS = new Date(2026, 10, 17, 23, 0, 0).getTime();
const BEFORE_AIR_WINDOW_MS = new Date(2026, 10, 17, 20, 0, 0).getTime();

const isCommandVisible = (id: string, ctx: CommandContext): boolean => {
  const cmd = COMMANDS.find((c) => c.id === id)!;
  return cmd.visible === null ? true : cmd.visible(ctx);
};

function radioByLabel(root: ParentNode, label: string): HTMLElement {
  const match = [...root.querySelectorAll<HTMLElement>('[role="radio"]')].find(
    (el) => {
      const labelledBy = el.getAttribute("aria-labelledby");
      return (
        labelledBy !== null &&
        document.getElementById(labelledBy)?.textContent === label
      );
    },
  );
  if (match === undefined) throw new RangeError(`missing radio "${label}"`);
  return match;
}

let mounted: Root | null = null;

afterEach(() => {
  act(() => {
    openRundownRestore(null);
    historyActions.reset(null);
    historyActions.setMode("page");
    setRundownView(DOC_ID, null);
    mounted?.unmount();
  });
  mounted = null;
  document.body.innerHTML = "";
});

function baselineRundown(): RundownJSON {
  return {
    rundown: {
      airDate: "2026-11-17",
      airAt: AIR_AT,
      windowLeadMs: 3_600_000,
      targetMs: 600_000,
    },
    columns: [...SHOW_COLUMNS],
    rows: [
      {
        id: ROW_H,
        order: "A",
        kind: "header",
        cells: {
          segment: {
            value: "ACT ONE",
            userId: "sam",
            setAt: IN_AIR_WINDOW_MS - 60_000,
            previous: null,
          },
        },
        docId: null,
        blockId: null,
        durationMs: null,
        prompter: null,
        unnumbered: false,
      },
      {
        id: ROW_A,
        order: "B",
        kind: "script",
        cells: {
          segment: {
            value: "Monologue",
            userId: "sam",
            setAt: IN_AIR_WINDOW_MS - 60_000,
            previous: null,
          },
        },
        docId: null,
        blockId: null,
        durationMs: 120_000,
        prompter: null,
        unnumbered: false,
      },
      {
        id: ROW_B,
        order: "C",
        kind: "item",
        cells: {
          segment: {
            value: "Old Desk Bit",
            userId: "sam",
            setAt: IN_AIR_WINDOW_MS - 60_000,
            previous: null,
          },
        },
        docId: null,
        blockId: null,
        durationMs: 60_000,
        prompter: null,
        unnumbered: false,
      },
      {
        id: ROW_C,
        order: "D",
        kind: "item",
        cells: {
          segment: {
            value: "Music Cue",
            userId: "sam",
            setAt: IN_AIR_WINDOW_MS - 60_000,
            previous: null,
          },
        },
        docId: null,
        blockId: null,
        durationMs: 30_000,
        prompter: null,
        unnumbered: false,
      },
    ],
  };
}

function workingRundown(): RundownJSON {
  return {
    rundown: {
      airDate: "2026-11-17",
      airAt: AIR_AT,
      windowLeadMs: 3_600_000,
      targetMs: 600_000,
    },
    columns: [...SHOW_COLUMNS],
    rows: [
      {
        id: ROW_H,
        order: "A",
        kind: "header",
        cells: {
          segment: {
            value: "ACT ONE",
            userId: "sam",
            setAt: IN_AIR_WINDOW_MS - 5_000,
            previous: null,
          },
        },
        docId: null,
        blockId: null,
        durationMs: null,
        prompter: null,
        unnumbered: false,
      },
      // ROW_C moved up from position 4 to position 2
      {
        id: ROW_C,
        order: "B",
        kind: "item",
        cells: {
          segment: {
            value: "Music Cue",
            userId: "sam",
            setAt: IN_AIR_WINDOW_MS - 5_000,
            previous: null,
          },
        },
        docId: null,
        blockId: null,
        durationMs: 30_000,
        prompter: null,
        unnumbered: false,
      },
      // ROW_A edited: Segment changed + Writer added (was empty)
      {
        id: ROW_A,
        order: "C",
        kind: "script",
        cells: {
          segment: {
            value: "Cold Open",
            userId: "sam",
            setAt: IN_AIR_WINDOW_MS - 5_000,
            previous: null,
          },
          writer: {
            value: "Dana",
            userId: "sam",
            setAt: IN_AIR_WINDOW_MS - 5_000,
            previous: null,
          },
        },
        docId: null,
        blockId: null,
        durationMs: 120_000,
        prompter: null,
        unnumbered: false,
      },
      // ROW_B removed; ROW_D added
      {
        id: ROW_D,
        order: "D",
        kind: "item",
        cells: {
          segment: {
            value: "Closing Sting",
            userId: "sam",
            setAt: IN_AIR_WINDOW_MS - 5_000,
            previous: null,
          },
        },
        docId: null,
        blockId: null,
        durationMs: 15_000,
        prompter: null,
        unnumbered: false,
      },
    ],
  };
}

function makeVersionRow(nowMs: number): HistoryRow {
  const item: VersionItem = {
    id: "v-rehearsal",
    kind: "named",
    name: "Rehearsal cut",
    createdByUserId: "sam",
    createdAt: nowMs - 120_000,
    onDevice: false,
    position: { generation: 1, seq: 10 },
    engineVersion: null,
    summary: { authorUserIds: ["sam"], changes: 4, scenes: 0 },
  };
  return {
    item,
    title: "Rehearsal cut",
    day: "Today",
    time: "22:58",
    local: null,
  };
}

async function mountRundownHistory(options: {
  access: RundownAccess;
  nowMs?: number;
  pageWidthPx?: number;
}) {
  const nowMs = options.nowMs ?? IN_AIR_WINDOW_MS;
  const working = workingRundown();
  const base = baselineRundown();
  const row = makeVersionRow(nowMs);
  const announced: string[] = [];
  const restoredCalls: { versionId: string; scope: RestoreScopeBody }[] = [];

  setRundownView(DOC_ID, {
    ready: true,
    rundown: working,
    clock: buildRundownClock(working, () => null),
    onDevice: new Set(),
    access: options.access,
    people: [],
    projectTitle: "The Late Desk",
    activeCell: null,
    selectedRowIds: new Set(),
    editingCell: false,
  });

  const versionContent: VersionContent = {
    v: 1,
    blocks: [],
    settings: {},
    schemaVersion: 2,
    engineVersion: null,
    locks: null,
    authors: {},
    rundown: base,
  };

  const rowsSub = createValue({
    rows: [row],
    state: { kind: "ready" as const },
    othersCanOpen: true,
  });

  const history: HistorySource = {
    rows: () => rowsSub,
    more: () => {},
    content: async () => versionContent,
    name: async () => ({ ok: true }),
    save: async () => ({ ok: true }),
    restore: async (_docId, versionId, scope) => {
      restoredCalls.push({ versionId, scope });
      return { ok: true, beforeVersionId: "v-before" };
    },
    whoWrote: async () => null,
    sinceOpened: async () => null,
    authors: async () => null,
  };

  const baseEnv = testEnvironment({ now: () => nowMs });
  const environment = {
    ...baseEnv,
    dom: {
      ...baseEnv.dom,
      announce(text: string) {
        announced.push(text);
      },
    },
  };
  const baseServices = testServices({ userId: "sam", environment });
  const services = {
    ...baseServices,
    history,
    library: {
      ...baseServices.library,
      docKindOf: () => createValue("rundown" as const),
      documentKind: () => createValue<ProjectKind | null>("show"),
    },
  };

  document.body.innerHTML = "";
  const frame = document.createElement("div");
  const page = document.createElement("div");
  page.setAttribute("data-rundown-page", "");
  if (options.pageWidthPx !== undefined) {
    Object.defineProperty(page, "clientWidth", {
      value: options.pageWidthPx,
      configurable: true,
    });
    page.getBoundingClientRect = () =>
      ({
        width: options.pageWidthPx!,
        height: 600,
        top: 0,
        left: 0,
        bottom: 600,
        right: options.pageWidthPx!,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  const panelHost = document.createElement("div");
  frame.append(page, panelHost);
  document.body.append(frame);

  mounted = createRoot(panelHost);
  await act(async () => {
    mounted!.render(
      <EnvironmentProvider environment={environment}>
        <ServicesProvider services={services}>
          <SettingsProvider store={services.settings}>
            <CommandsProvider
              service={services.commands}
              resolved={services.resolved}
              platform="mac"
            >
              <TimingProvider
                timing={{
                  now: environment.now,
                  schedule: environment.schedule,
                }}
              >
                <HistoryVersions docId={DOC_ID} />
              </TimingProvider>
            </CommandsProvider>
          </SettingsProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });
  await until(() =>
    (panelHost.textContent ?? "").includes(RUNDOWN_HISTORY_WORDS.modes[0]),
  );
  return { frame, panelHost, announced, restoredCalls };
}

test("rundown History renders In the grid, Side by side and As it was with non-colour diffs and step announcements", async () => {
  const { frame, panelHost, announced } = await mountRundownHistory({
    access: "edit",
    pageWidthPx: 1000,
  });

  // Select Rehearsal cut to open In the grid comparison
  const versionRow = [...panelHost.querySelectorAll(".mn-row")].find((el) =>
    el.textContent?.includes("Rehearsal cut"),
  ) as HTMLElement;
  expect(versionRow).toBeDefined();
  await act(async () => {
    versionRow.click();
  });

  await until(
    () => frame.querySelector('[data-rundown-history-mode="grid"]') !== null,
  );
  const overlay = frame.querySelector("[data-rundown-history-overlay]")!;
  expect(overlay.getAttribute("data-rundown-history-mode")).toBe("grid");

  // Non-colour diff attributes & text markers (LIS keeps Music Cue and marks Cold Open moved down from 2)
  expect(
    overlay.querySelector('[data-diff-row="added"]')?.textContent,
  ).toContain(RUNDOWN_HISTORY_WORDS.added);
  expect(
    overlay.querySelector('[data-diff-row="removed"]')?.textContent,
  ).toContain(RUNDOWN_HISTORY_WORDS.removed);
  expect(
    overlay.querySelector('[data-diff-row="moved"]')?.textContent,
  ).toContain(RUNDOWN_HISTORY_WORDS.movedDownFrom(2));
  expect(overlay.textContent).toContain(
    RUNDOWN_HISTORY_WORDS.wasValue("Monologue"),
  );
  expect(overlay.textContent).toContain(RUNDOWN_HISTORY_WORDS.wasEmpty);

  // Step through changes with Next change and verify data-change-current + dom.announce
  const nextBtn = [...panelHost.querySelectorAll("button")].find(
    (b) => b.textContent === HISTORY_WORDS.nextChange,
  ) as HTMLButtonElement;
  await act(async () => {
    nextBtn.click();
  });
  expect(overlay.querySelector("[data-change-current]")).not.toBeNull();
  expect(announced.at(-1)).toBe(
    RUNDOWN_HISTORY_WORDS.rowRemovedAnnouncement(1, 4, 3, "Old Desk Bit"),
  );
  await act(async () => {
    nextBtn.click();
  });
  expect(announced.at(-1)).toBe(
    RUNDOWN_HISTORY_WORDS.changeAnnouncement(
      2,
      4,
      3,
      "Cold Open",
      "Segment",
      "Monologue",
      "Cold Open",
    ),
  );
  await act(async () => {
    nextBtn.click();
  });
  expect(announced.at(-1)).toBe(
    RUNDOWN_HISTORY_WORDS.changeAnnouncement(
      3,
      4,
      3,
      "Cold Open",
      "Writer",
      "empty",
      "Dana",
    ),
  );

  // Switch to Side by side
  const sideRadio = radioByLabel(panelHost, RUNDOWN_HISTORY_WORDS.modes[1]);
  await act(async () => {
    sideRadio.click();
  });
  await until(
    () => frame.querySelector('[data-rundown-history-mode="side"]') !== null,
  );
  expect(
    frame.querySelector('[data-rundown-history-mode="side"]')?.textContent,
  ).toContain(HISTORY_WORDS.workingLabel);

  // Switch to As it was
  const asItWasRadio = radioByLabel(panelHost, RUNDOWN_HISTORY_WORDS.modes[2]);
  await act(async () => {
    asItWasRadio.click();
  });
  await until(
    () =>
      frame.querySelector('[data-rundown-history-mode="as_it_was"]') !== null,
  );
  const historical = frame.querySelector(
    '[data-rundown-history-mode="as_it_was"]',
  )!;
  expect(historical.textContent).toContain("Old Desk Bit");
  expect(historical.textContent).not.toContain("Closing Sting");
  expect(historical.querySelector('[data-diff-row="added"]')).toBeNull();
});

test("Side by side disables cleanly below 50rem with explicit reason", async () => {
  const { panelHost } = await mountRundownHistory({
    access: "edit",
    pageWidthPx: 640,
  });
  expect(panelHost.textContent).toContain(
    RUNDOWN_HISTORY_WORDS.sideBySideTooNarrow,
  );
  const sideRadio = radioByLabel(panelHost, RUNDOWN_HISTORY_WORDS.modes[1]);
  expect(
    sideRadio.getAttribute("aria-disabled") === "true" ||
      sideRadio.hasAttribute("data-disabled"),
  ).toBe(true);
});

test("full restore and row restore ConsequenceDialogs obey assertQuestionTitle and show air-window notice when live", async () => {
  const { frame, panelHost, restoredCalls } = await mountRundownHistory({
    access: "edit",
    nowMs: IN_AIR_WINDOW_MS,
    pageWidthPx: 1000,
  });

  // Open Rehearsal cut comparison
  const versionRow = [...panelHost.querySelectorAll(".mn-row")].find((el) =>
    el.textContent?.includes("Rehearsal cut"),
  ) as HTMLElement;
  await act(async () => {
    versionRow.click();
  });
  await until(
    () => frame.querySelector('[data-rundown-history-mode="grid"]') !== null,
  );

  // Click full Restore 'Rehearsal cut' in overlay header
  const fullRestoreBtn = [...frame.querySelectorAll("button")].find(
    (b) => b.textContent === "Restore 'Rehearsal cut'",
  ) as HTMLButtonElement;
  expect(fullRestoreBtn).toBeDefined();
  await act(async () => {
    fullRestoreBtn.click();
  });
  await until(() => document.querySelector('[role="alertdialog"]') !== null);
  const dialog = document.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain("Restore 'Rehearsal cut'?");
  expect(dialog.textContent).toContain(RUNDOWN_HISTORY_WORDS.restoreBody);
  expect(dialog.textContent).toContain(RUNDOWN_HISTORY_WORDS.inAirWindow);

  // Confirm full restore
  const confirmFull = [...dialog.querySelectorAll("button")].find(
    (b) => b.textContent === "Restore 'Rehearsal cut'",
  ) as HTMLButtonElement;
  await act(async () => {
    confirmFull.click();
  });
  await until(() => restoredCalls.length === 1);
  expect(restoredCalls[0]).toEqual({
    versionId: "v-rehearsal",
    scope: { kind: "script" },
  });

  // Open single-row restore on changed row 3 (Cold Open)
  const coldOpenRow = [
    ...frame.querySelectorAll('[data-rundown-history-overlay] [role="row"]'),
  ].find((el) => el.textContent?.includes("Cold Open"))!;
  const coldOpenRestore = coldOpenRow.querySelector(
    "button",
  ) as HTMLButtonElement;
  expect(coldOpenRestore).not.toBeNull();
  await act(async () => {
    coldOpenRestore.click();
  });
  await until(() => document.querySelector('[role="alertdialog"]') !== null);
  const rowDialog = document.querySelector('[role="alertdialog"]')!;
  expect(rowDialog.textContent).toContain(
    "Restore row 3 from 'Rehearsal cut'?",
  );
  expect(rowDialog.textContent).toContain(
    RUNDOWN_HISTORY_WORDS.restoreRowBody(3),
  );
  expect(rowDialog.textContent).toContain(RUNDOWN_HISTORY_WORDS.inAirWindow);
  const confirmRow = [...rowDialog.querySelectorAll("button")].find(
    (b) => b.textContent === "Restore row 3",
  ) as HTMLButtonElement;
  await act(async () => {
    confirmRow.click();
  });
  await until(() => restoredCalls.length === 2);
  expect(restoredCalls[1]).toEqual({
    versionId: "v-rehearsal",
    scope: { kind: "row", rowId: ROW_A },
  });
});

test("air-window notice is omitted outside the air window and header-row restore uses header title", async () => {
  await mountRundownHistory({
    access: "edit",
    nowMs: BEFORE_AIR_WINDOW_MS,
    pageWidthPx: 1000,
  });
  await act(async () => {
    openRundownRestore({
      kind: "row",
      docId: DOC_ID,
      versionId: "v-rehearsal",
      ref: "'Rehearsal cut'",
      rowId: ROW_H,
      rowNum: null,
      rowTitle: "ACT ONE",
    });
  });
  await until(() => document.querySelector('[role="alertdialog"]') !== null);
  const dialog = document.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain(
    "Restore 'ACT ONE' from 'Rehearsal cut'?",
  );
  expect(dialog.textContent).not.toContain(RUNDOWN_HISTORY_WORDS.inAirWindow);
});

test("History tab is strictly read-only when !canEdit and commands hide script-only & mutating actions on rundowns", async () => {
  const { frame, panelHost } = await mountRundownHistory({
    access: "view_only",
    pageWidthPx: 1000,
  });

  // Zero row-menu or Restore buttons in the History list
  expect(panelHost.querySelector('button[aria-label*="row menu"]')).toBeNull();

  // Clicking a version still opens the live read-only diff without any Restore buttons
  const versionRow = [...panelHost.querySelectorAll(".mn-row")].find((el) =>
    el.textContent?.includes("Rehearsal cut"),
  ) as HTMLElement;
  await act(async () => {
    versionRow.click();
  });
  await until(
    () => frame.querySelector('[data-rundown-history-mode="grid"]') !== null,
  );
  const overlay = frame.querySelector("[data-rundown-history-overlay]")!;
  expect(
    [...overlay.querySelectorAll("button")].map((b) => b.textContent),
  ).toEqual(["Back to Working"]);

  // Command visibility checks for rundown without edit_rundowns vs with edit_rundowns
  const baseCtx: CommandContext = {
    screen: "document",
    focus: "panel",
    docOpen: true,
    role: "editor",
    online: true,
    platform: "mac",
    shell: "web",
    demo: false,
    signedIn: true,
    workspace: "writable",
    panelOpen: { left: false, side: true },
    historyPresent: true,
    format: null,
    rulerShown: false,
    layoutView: "page",
    spaceBeforeSet: false,
    zoom: null,
    zoomPercent: null,
    production: null,
    docKind: "rundown",
    projectKind: "show",
    outlineStart: false,
    writing: null,
    material: null,
    rundown: {
      canEdit: false,
      selectedRows: 0,
      scriptRowSelected: false,
      editingCell: false,
    },
    prompter: null,
    inTrash: false,
    canDelete: false,
    focusMode: false,
    readingAloud: false,
    sprintRunning: false,
  };
  expect(isCommandVisible("history.markVersion", baseCtx)).toBe(false);
  expect(isCommandVisible("history.nameDraft", baseCtx)).toBe(false);
  expect(isCommandVisible("history.restore", baseCtx)).toBe(false);
  expect(isCommandVisible("history.restoreScene", baseCtx)).toBe(false);
  expect(isCommandVisible("history.whoWrote", baseCtx)).toBe(false);

  const editCtx: CommandContext = {
    ...baseCtx,
    rundown: { ...baseCtx.rundown!, canEdit: true },
  };
  expect(isCommandVisible("history.markVersion", editCtx)).toBe(true);
  expect(isCommandVisible("history.nameDraft", editCtx)).toBe(true);
  expect(isCommandVisible("history.restore", editCtx)).toBe(true);
  expect(isCommandVisible("history.restoreScene", editCtx)).toBe(false);
  expect(isCommandVisible("history.whoWrote", editCtx)).toBe(false);
});
