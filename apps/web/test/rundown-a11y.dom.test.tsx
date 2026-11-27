import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import type { RundownClock } from "@manent/pagination";
import { SHOW_COLUMNS } from "@manent/schema";
import type { RundownRowJSON } from "@manent/schema";
import {
  CommandsProvider,
  PROMPTER_CONTROL_WORDS,
  RUNDOWN_WORDS,
  SettingsProvider,
  TimingProvider,
} from "@manent/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { DetailsTimingCard } from "../src/rundown/details-timing-card.tsx";
import { buildGridRows } from "../src/rundown/rundown-cells.tsx";
import { RundownFooterBar } from "../src/rundown/rundown-footer-bar.tsx";
import {
  prompterTally,
  sectionDurationsByHeader,
} from "../src/rundown/section-timing.ts";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { testEnvironment, testServices } from "./services.fixtures.ts";

withDom();

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

const SAMPLE_ROWS: RundownRowJSON[] = [
  {
    id: "h1",
    kind: "header",
    order: "a0",
    docId: null,
    blockId: null,
    unnumbered: false,
    durationMs: null,
    prompter: null,
    cells: {
      segment: { value: "ACT ONE", setAt: 1, userId: "dana", previous: null },
    },
  },
  {
    id: "r1",
    kind: "script",
    order: "a1",
    docId: "story-1",
    blockId: null,
    unnumbered: false,
    durationMs: 120_000,
    prompter: {
      state: "on",
      sentAt: 10,
      versionId: "v-1",
      sentByUserId: "dana",
    },
    cells: {
      segment: { value: "Monologue", setAt: 1, userId: "dana", previous: null },
    },
  },
  {
    id: "r2",
    kind: "script",
    order: "a2",
    docId: "story-2",
    blockId: null,
    unnumbered: false,
    durationMs: 90_000,
    prompter: {
      state: "changed",
      sentAt: 10,
      versionId: "v-1",
      sentByUserId: "dana",
    },
    cells: {
      segment: {
        value: "Desk piece",
        setAt: 1,
        userId: "dana",
        previous: null,
      },
    },
  },
];

const AIR_AT = new Date(2026, 10, 17, 23, 35, 0).getTime();

const SAMPLE_CLOCK: RundownClock = {
  totalMs: 210_000,
  overMs: -30_000,
  airWindow: {
    startsAt: AIR_AT - 3_600_000,
    endsAt: AIR_AT + 240_000,
  },
  rows: [
    {
      id: "h1",
      number: null,
      durMs: null,
      cumeMs: null,
      startAt: null,
      backAt: null,
    },
    {
      id: "r1",
      number: 1,
      durMs: 120_000,
      cumeMs: 120_000,
      startAt: 1000,
      backAt: 2000,
    },
    {
      id: "r2",
      number: 2,
      durMs: 90_000,
      cumeMs: 210_000,
      startAt: 2000,
      backAt: 3000,
    },
  ],
};

test("sectionDurationsByHeader sums durations per act header and prompterTally counts sent and changed scripts", () => {
  const byHeader = sectionDurationsByHeader(SAMPLE_ROWS, SAMPLE_CLOCK);
  expect(byHeader.get("h1")).toBe(210_000);
  expect(prompterTally(SAMPLE_ROWS)).toEqual({ total: 2, sent: 1, changed: 1 });
});

test("buildGridRows marks besideDocId row as current and builds section subtotal headerDisplay", () => {
  const gridRows = buildGridRows({
    docId: "rd-1",
    rundown: {
      rundown: {
        airDate: "2026-11-17",
        airAt: 1_000_000,
        windowLeadMs: 3_600_000,
        targetMs: 240_000,
      },
      columns: [...SHOW_COLUMNS],
      rows: SAMPLE_ROWS,
    },
    clock: SAMPLE_CLOCK,
    columnIds: SHOW_COLUMNS,
    titleColumn: "segment",
    online: true,
    readOnly: false,
    besideDocId: "story-1",
    onDevice: new Set(["story-1"]),
    liveDuration: () => null,
    cellPresence: () => [],
    cornerMark: () => false,
    activeCell: null,
    tourCell: null,
    onBeforeMenuOpen: () => {},
    onOpenBeside: () => {},
    onOpenPrevious: () => {},
  });

  expect([
    gridRows[0]?.headerDisplay !== undefined,
    gridRows[1]?.current,
    gridRows[2]?.current,
  ]).toEqual([true, true, false]);
});

test("RundownFooterBar hides row-edit buttons in readOnly mode while keeping timing summary", () => {
  const env = testEnvironment();
  const services = testServices({ userId: "dana", environment: env });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(
      <EnvironmentProvider environment={env}>
        <ServicesProvider services={services}>
          <SettingsProvider store={services.settings}>
            <CommandsProvider
              service={services.commands}
              resolved={services.resolved}
              platform="mac"
            >
              <TimingProvider timing={{ now: env.now, schedule: env.schedule }}>
                <RundownFooterBar
                  readOnly={true}
                  hasRows={true}
                  clock={SAMPLE_CLOCK}
                  rows={SAMPLE_ROWS}
                />
              </TimingProvider>
            </CommandsProvider>
          </SettingsProvider>
        </ServicesProvider>
      </EnvironmentProvider>,
    );
  });

  const text = host.textContent ?? "";
  expect(text).toContain(RUNDOWN_WORDS.totalRuntime("3:30"));
  expect(text).toContain("Under 0:30");
  expect(text).toContain(RUNDOWN_WORDS.prompterSentSummary(1, 2));
  expect(text).toContain(RUNDOWN_WORDS.prompterChangedCount(1));
  expect(text).not.toContain(RUNDOWN_WORDS.addRow);
});

test("DetailsTimingCard renders zero h2 headings and displays live timing summary", () => {
  const airAt = new Date(2026, 10, 17, 23, 35, 0).getTime();
  const nowMs = new Date(2026, 10, 17, 23, 0, 0).getTime();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(
      <DetailsTimingCard
        clock={SAMPLE_CLOCK}
        fields={{
          airDate: "2026-11-17",
          airAt,
          windowLeadMs: 3_600_000,
          targetMs: 240_000,
        }}
        rows={SAMPLE_ROWS}
        nowMs={nowMs}
      />,
    );
  });

  expect(host.querySelectorAll("h2").length).toBe(0);
  expect(host.textContent).toContain("3:30");
  expect(host.textContent).toContain("Under 0:30");
  expect(host.textContent).toContain(RUNDOWN_WORDS.inAirWindow);
  expect(PROMPTER_CONTROL_WORDS.decreaseSpeed).toBe("Scroll rate down");
  expect(PROMPTER_CONTROL_WORDS.increaseSpeed).toBe("Scroll rate up");
});
