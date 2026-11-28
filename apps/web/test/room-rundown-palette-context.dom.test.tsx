// DOM & integration tests for Room driver and Rundown CommandContext precision in Command Palette & CommandService.
import { withDom } from "@manent/testkit/dom";
import { createDoc } from "@manent/crdt";
import type { RundownJSON } from "@manent/schema";
import { afterEach, describe, expect, test } from "bun:test";
import { driverCommandContext } from "../src/room/driver-context.ts";
import { watchDriver } from "../src/room/driver.ts";
import {
  clearCopiedRows,
  rememberCopiedRows,
} from "../src/rundown/clipboard.ts";
import { buildRundownCommandContext } from "../src/rundown/command-context.ts";
import { tabStorage, writePerson } from "../src/session.ts";
import { snapshotPaletteSignals } from "../src/shell/palette-context.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { rundownActions } from "../src/state/rundown.store.ts";
import { testEnvironment, testServices } from "./services.fixtures.ts";
import { fakeHandle, turn } from "./sync.fixtures.ts";

withDom();
bindGuard(createGuard({ flavour: "test" }));

const SCRIPT_ID = "984682f4-e8ec-80ad-92f4-cdf10d9e0cc3";
const RUNDOWN_ID = "11111111-2222-4333-8444-555555555555";
const DANA = { userId: "dana", name: "Dana Reyes" };
const SAM = { token: "token-sam", userId: "sam", name: "Sam Okafor" };

const encodeControl = (payload: object): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(payload));

afterEach(() => {
  clearCopiedRows();
  rundownActions.setContext(RUNDOWN_ID, null);
  writePerson(tabStorage(), null);
});

describe("Room driver CommandContext precision", () => {
  test("driverCommandContext and snapshotPaletteSignals track no driver, other driver, and self driving", async () => {
    writePerson(tabStorage(), SAM);
    const environment = testEnvironment();
    const handle = fakeHandle(SCRIPT_ID, createDoc({ clientId: 1 }));
    const services = {
      ...testServices({ userId: SAM.userId, environment }),
      openHandle: async () => handle,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async () =>
        new Response(JSON.stringify({ driver: null }), { status: 200 }),
      { preconnect: originalFetch.preconnect },
    );

    const stop = watchDriver(SCRIPT_ID, services, { emitMessages: false });
    try {
      await turn();

      // Initially nobody is driving.
      expect(driverCommandContext(SAM.userId, SCRIPT_ID)).toEqual({
        active: false,
        isSelf: false,
        name: null,
      });

      // Dana takes keys -> Sam sees Dana driving, caret outside speech (no live editor).
      handle.emit({
        type: "control",
        kind: "driver_changed",
        data: encodeControl({ docId: SCRIPT_ID, driver: DANA, at: 1 }),
      });
      expect(driverCommandContext(SAM.userId, SCRIPT_ID)).toEqual({
        active: true,
        isSelf: false,
        name: "Dana",
        caretInSpeech: false,
      });

      const signals = snapshotPaletteSignals({
        docId: SCRIPT_ID,
        routeId: "/s/$docId",
        inTitlePage: false,
        services,
        env: environment,
        facts: null,
        outline: null,
        people: null,
      });
      expect(signals.command.driver).toEqual({
        active: true,
        isSelf: false,
        name: "Dana",
        caretInSpeech: false,
      });

      // Sam takes keys -> isSelf becomes true.
      handle.emit({
        type: "control",
        kind: "driver_changed",
        data: encodeControl({
          docId: SCRIPT_ID,
          driver: { userId: SAM.userId, name: SAM.name },
          at: 2,
        }),
      });
      expect(driverCommandContext(SAM.userId, SCRIPT_ID)).toEqual({
        active: true,
        isSelf: true,
        name: "Sam",
      });

      // Driver stops presenting -> active returns to false.
      handle.emit({
        type: "control",
        kind: "driver_changed",
        data: encodeControl({ docId: SCRIPT_ID, driver: null, at: 3 }),
      });
      expect(driverCommandContext(SAM.userId, SCRIPT_ID)).toEqual({
        active: false,
        isSelf: false,
        name: null,
      });
    } finally {
      stop();
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Rundown CommandContext precision", () => {
  const sampleRundown: RundownJSON = {
    rundown: {
      airDate: "2026-11-17",
      airAt: null,
      windowLeadMs: 3_600_000,
      targetMs: 2_520_000,
    },
    columns: ["segment", "writer", "dur"],
    rows: [
      {
        id: "r1",
        order: "a0",
        kind: "script",
        docId: "story-1",
        blockId: null,
        unnumbered: false,
        durationMs: null,
        prompter: null,
        cells: {
          segment: {
            value: "Monologue",
            userId: "dana",
            setAt: 1000,
            previous: { value: "Cold open", userId: "sam", setAt: 900 },
          },
        },
      },
      {
        id: "r2",
        order: "a1",
        kind: "item",
        docId: null,
        blockId: null,
        unnumbered: false,
        durationMs: null,
        prompter: null,
        cells: {
          segment: {
            value: "Band intro",
            userId: "dana",
            setAt: 1000,
            previous: null,
          },
        },
      },
      {
        id: "r3",
        order: "a2",
        kind: "item",
        docId: null,
        blockId: null,
        unnumbered: false,
        durationMs: null,
        prompter: null,
        cells: {},
      },
    ],
  };

  test("computes exact canMoveUp, canMoveDown, hasClipboard, and hasPreviousValue for every row position", () => {
    clearCopiedRows();

    // First row, cell with previous value, empty clipboard.
    expect(
      buildRundownCommandContext({
        canEdit: true,
        rundown: sampleRundown,
        activeCell: { rowId: "r1", columnId: "segment" },
        selectedRowIds: new Set(),
        editingCell: false,
      }),
    ).toEqual({
      canEdit: true,
      selectedRows: 0,
      scriptRowSelected: true,
      editingCell: false,
      canMoveUp: false,
      canMoveDown: true,
      hasClipboard: false,
      hasPreviousValue: true,
    });

    // Middle row, cell without previous value, populated clipboard.
    rememberCopiedRows(
      {
        version: 1,
        sourceDocId: RUNDOWN_ID,
        rows: [{ kind: "item", docId: null, unnumbered: false, cells: {} }],
      },
      "Band intro",
    );
    expect(
      buildRundownCommandContext({
        canEdit: true,
        rundown: sampleRundown,
        activeCell: { rowId: "r2", columnId: "segment" },
        selectedRowIds: new Set(["r2"]),
        editingCell: false,
      }),
    ).toEqual({
      canEdit: true,
      selectedRows: 1,
      scriptRowSelected: false,
      editingCell: false,
      canMoveUp: true,
      canMoveDown: true,
      hasClipboard: true,
      hasPreviousValue: false,
    });

    // Last row -> cannot move down.
    expect(
      buildRundownCommandContext({
        canEdit: true,
        rundown: sampleRundown,
        activeCell: { rowId: "r3", columnId: "segment" },
        selectedRowIds: new Set(),
        editingCell: false,
      }),
    ).toMatchObject({
      canMoveUp: true,
      canMoveDown: false,
      hasClipboard: true,
      hasPreviousValue: false,
    });
  });
});
