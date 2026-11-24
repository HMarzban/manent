import { expect, test } from "bun:test";
import type { RundownJSON } from "@manent/schema";
import { createValue, formatDuration } from "@manent/ui";
import { parseColumnPrefs } from "../src/rundown/columns.tsx";
import { formatAirDate, parseDurationMs } from "../src/rundown/dur-format.ts";
import { registerRundownUndo } from "../src/rundown/handlers.ts";
import { rowReadoutText } from "../src/rundown/row-readout.tsx";
import { buildRundownClock } from "../src/rundown/rundown-access.ts";
import { INITIAL_SHELL_STATE } from "../src/services/ports.ts";
import type { ShellState } from "../src/services/ports.ts";
import { bindGuard } from "../src/state/guard.ts";
import { rundownActions } from "../src/state/rundown.store.ts";
import {
  QUIET_DOM,
  createNavigation,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

test("duration parsing accepts m:ss and h:mm:ss with two-digit seconds and refuses malformed values", () => {
  expect([
    parseDurationMs("0:00"),
    parseDurationMs("2:07"),
    parseDurationMs("42:00"),
    parseDurationMs("1:02:07"),
    parseDurationMs("2:7"),
    parseDurationMs("2:60"),
    parseDurationMs("-1:00"),
    parseDurationMs("abc"),
    parseDurationMs(""),
  ]).toEqual([0, 127_000, 2_520_000, 3_727_000, null, null, null, null, null]);
});

test("air date formats without year in the current year and with year outside it", () => {
  const now2026 = new Date(2026, 10, 10, 12, 0, 0).getTime();
  expect([
    formatAirDate("2026-11-17", now2026),
    formatAirDate("2027-11-17", now2026),
    formatAirDate("2026-02-30", now2026),
    formatAirDate("", now2026),
  ]).toEqual(["Tue 17 Nov", "Wed 17 Nov 2027", "", ""]);
});

test("with the late-night wireframe durations, Start minus Back equals 0:48 on every row and state is Over 0:48", () => {
  const airAt = new Date(2026, 10, 17, 23, 35, 0).getTime();
  const durSecs = [
    130, 465, 30, 260, 15, 40, 510, 245, 35, 375, 25, 190, 20, 198, 30,
  ];
  const rundown: RundownJSON = {
    rundown: {
      airDate: "2026-11-17",
      airAt,
      windowLeadMs: 3_600_000,
      targetMs: 42 * 60 * 1000,
    },
    columns: [
      "number",
      "segment",
      "writer",
      "dur",
      "cume",
      "start",
      "back",
      "prompter",
    ],
    rows: durSecs.map((sec, i) => ({
      id: `r${i + 1}`,
      order: String(i).padStart(3, "0"),
      kind: "script",
      cells: {},
      docId: `doc-${i + 1}`,
      blockId: null,
      durationMs: sec * 1000,
      prompter: null,
      unnumbered: false,
    })),
  };
  const clock = buildRundownClock(rundown, () => null);
  expect(clock.overMs).toBe(48_000);
  expect(formatDuration(clock.overMs!)).toBe("0:48");
  expect(clock.rows.map((r) => r.startAt! - r.backAt!)).toEqual(
    durSecs.map(() => 48_000),
  );
  expect(formatDuration(clock.totalMs)).toBe("42:48");
});

test("column preferences clamp widths between 48 and 480 px and ignore invalid fields", () => {
  expect(
    parseColumnPrefs({
      hidden: ["writer", 42, "writer"],
      widthsPx: { segment: 12, prompter: 999, dur: 84.4, bad: "wide" },
    }),
  ).toEqual({
    hidden: ["writer"],
    widthsPx: { segment: 48, prompter: 480, dur: 84 },
  });
  expect(parseColumnPrefs(null)).toEqual({ hidden: [], widthsPx: {} });
});

test("row readout reports numbered rows, header/unnumbered titles alone, and multi-row selection", () => {
  const rundown: RundownJSON = {
    rundown: {
      airDate: "2026-11-17",
      airAt: null,
      windowLeadMs: 3_600_000,
      targetMs: null,
    },
    columns: ["number", "segment"],
    rows: [
      {
        id: "h1",
        order: "001",
        kind: "header",
        cells: {
          segment: {
            value: "ACT ONE",
            userId: "dana",
            setAt: 1,
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
        id: "r1",
        order: "002",
        kind: "item",
        cells: {
          segment: {
            value: "Open titles",
            userId: "dana",
            setAt: 1,
            previous: null,
          },
        },
        docId: null,
        blockId: null,
        durationMs: 30_000,
        prompter: null,
        unnumbered: true,
      },
      {
        id: "r2",
        order: "003",
        kind: "script",
        cells: {
          segment: {
            value: "Monologue",
            userId: "dana",
            setAt: 1,
            previous: null,
          },
        },
        docId: "d-mono",
        blockId: null,
        durationMs: 465_000,
        prompter: null,
        unnumbered: false,
      },
    ],
  };
  const clock = buildRundownClock(rundown, () => null);
  const base = {
    ready: true,
    rundown,
    clock,
    onDevice: new Set<string>(),
    access: "edit" as const,
    people: [],
    projectTitle: "The Late Desk",
    activeCell: null,
    selectedRowIds: new Set<string>(),
    editingCell: false,
  };
  expect(
    rowReadoutText({
      ...base,
      activeCell: { rowId: "h1", columnId: "segment" },
    }),
  ).toBe("ACT ONE");
  expect(
    rowReadoutText({
      ...base,
      activeCell: { rowId: "r1", columnId: "segment" },
    }),
  ).toBe("Open titles");
  expect(
    rowReadoutText({
      ...base,
      activeCell: { rowId: "r2", columnId: "segment" },
    }),
  ).toBe("Row 1 of 1 · Monologue");
  expect(
    rowReadoutText({
      ...base,
      selectedRowIds: new Set(["r1", "r2"]),
    }),
  ).toBe("2 rows selected");
});

test("edit.undo and edit.redo route through the rundown rows slot when a rundown is open", () => {
  const docId = "rundown-undo-test";
  const environment = testEnvironment({
    dom: { ...QUIET_DOM, focusKind: () => "other" },
    shellState: createValue<ShellState>({
      ...INITIAL_SHELL_STATE,
      screen: "document",
      docId,
    }),
  });
  bindGuard(environment.guard);
  const services = testServices({
    userId: "dana",
    environment,
    router: createNavigation({
      routeId: "/s/$docId",
      href: `/s/${docId}`,
      search: {},
    }).navigation,
  });
  const editorCalls: unknown[] = [];
  services.editor.attach({
    run(id) {
      editorCalls.push(id);
      return { ok: true };
    },
    zoomPercent: () => 100,
    showTitlePage: () => {},
  });
  const rundownCalls: string[] = [];
  rundownActions.setContext(docId, {
    canEdit: true,
    selectedRows: 0,
    scriptRowSelected: false,
    editingCell: false,
  });
  const stopUndo = registerRundownUndo({
    undo: () => rundownCalls.push("undo"),
    redo: () => rundownCalls.push("redo"),
  });
  try {
    expect(services.commands.run("edit.undo", "menu")).toBe("ran");
    expect(services.commands.run("edit.redo", "menu")).toBe("ran");
    expect(rundownCalls).toEqual(["undo", "redo"]);
    expect(editorCalls).toEqual([]);
  } finally {
    stopUndo();
    rundownActions.setContext(docId, null);
  }
});
