import { beforeEach, expect, test } from "bun:test";
import { COMMANDS, createCommandService } from "@manent/commands";
import type { CommandContext, CommandHandlers } from "@manent/commands";
import type { Pagination } from "@manent/pagination";
import {
  SETTINGS,
  createMemoryBag,
  createSettingsStore,
} from "@manent/settings";
import { createCommandSource, createMessageQueue, rankRows } from "@manent/ui";
import type { HandlerDeps } from "../src/handlers/index.ts";
import {
  askLinesPerPage,
  askReadRate,
  askTargetPages,
  setPendingNumericInitial,
} from "../src/handlers/numeric-settings.ts";
import { createPlaceSource } from "../src/shell/palette-places.ts";
import { parseNumericCommandQuery } from "../src/shell/palette-query.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import type { OutlineSelectors } from "../src/state/outline.store.ts";
import {
  paletteActions,
  selectors as paletteSelectors,
} from "../src/state/palette.store.ts";

beforeEach(() => {
  bindGuard(createGuard({ flavour: "test" }));
});

test("parseNumericCommandQuery recognises trailing numeric and reset values without false positives", () => {
  expect(parseNumericCommandQuery("lines 50")).toEqual({
    commandId: "doc.linesPerPage",
    value: "50",
  });
  expect(parseNumericCommandQuery("Lines per page 54")).toEqual({
    commandId: "doc.linesPerPage",
    value: "54",
  });
  expect(parseNumericCommandQuery("lpp default")).toEqual({
    commandId: "doc.linesPerPage",
    value: "default",
  });
  expect(parseNumericCommandQuery("read rate 12.5")).toEqual({
    commandId: "project.readRate",
    value: "12.5",
  });
  expect(parseNumericCommandQuery("cps 10")).toEqual({
    commandId: "project.readRate",
    value: "10",
  });
  expect(parseNumericCommandQuery("read rate default")).toBeNull();
  expect(parseNumericCommandQuery("target 110")).toEqual({
    commandId: "project.targetPages",
    value: "110",
  });
  expect(parseNumericCommandQuery("target length none")).toEqual({
    commandId: "project.targetPages",
    value: "none",
  });
  expect(parseNumericCommandQuery("lines")).toBeNull();
  expect(parseNumericCommandQuery("page 12")).toBeNull();
  expect(parseNumericCommandQuery("scene 4")).toBeNull();
});

test("setPendingNumericInitial pre-fills PaletteAsk once and clears on consumption", () => {
  const personal = createMemoryBag({ initial: {}, writable: () => true });
  const device = createMemoryBag({ initial: {}, writable: () => true });
  const script = createMemoryBag({ initial: {}, writable: () => true });
  const project = createMemoryBag({ initial: {}, writable: () => true });
  const store = createSettingsStore({
    registry: SETTINGS,
    bags: { personal, device, script, project },
    beforeWrite: () => {},
    deferRemote: (apply) => apply(),
    locked: () => false,
  });
  const deps = {
    services: {
      openScriptStore: () => store,
      messages: createMessageQueue({ now: () => 0, schedule: () => () => {} }),
      reverses: { set: () => {}, run: () => false },
    },
    shellState: () => ({ docId: "doc-1" }),
  } as unknown as HandlerDeps;

  setPendingNumericInitial("doc.linesPerPage", "50");
  askLinesPerPage(deps);
  expect(paletteSelectors.ask()?.initial).toBe("50");

  // Second opening without a new prefill falls back to current value (empty for null)
  askLinesPerPage(deps);
  expect(paletteSelectors.ask()?.initial).toBe("");

  setPendingNumericInitial("project.readRate", "13.2");
  askReadRate(deps);
  expect(paletteSelectors.ask()?.initial).toBe("13.2");

  setPendingNumericInitial("project.targetPages", "95");
  askTargetPages(deps);
  expect(paletteSelectors.ask()?.initial).toBe("95");
  paletteActions.close();
});

test("createPlaceSource matches page 12 cleanly without matching total count and finds scenes by full word", () => {
  const scenes = [
    {
      kind: "scene",
      blockId: "s1",
      number: "1",
      heading: "INT. HARBOUR - DAY",
    },
    { kind: "scene", blockId: "s4", number: "4", heading: "EXT. PIER - NIGHT" },
    {
      kind: "scene",
      blockId: "s14",
      number: "14",
      heading: "INT. BOAT - DAWN",
    },
  ] as const;
  const outline = {
    count: () => scenes.length,
    row: (index: number) => scenes[index],
  } as unknown as OutlineSelectors;

  const pagination = {
    blocks: [],
    pages: Array.from({ length: 12 }, (_, index) => ({
      index,
      label: String(index + 1),
    })),
  } as unknown as Pagination;

  const source = createPlaceSource({ outline, pagination: () => pagination });

  // "page 12" in a 12-page script matches ONLY Page 12 of 12 (never Page 1 of 12)
  const page12 = rankRows("page 12", source.rows("page 12"));
  expect(page12.map((r) => r.label)).toEqual(["Page 12 of 12"]);

  // "p 1" ranks Page 1 ahead of Page 10, 11, 12
  const page1 = rankRows("page 1", source.rows("page 1"));
  expect(page1[0]?.label).toBe("Page 1 of 12");

  // "scene 4" matches Sc. 4 · EXT. PIER - NIGHT
  const scene4 = rankRows("scene 4", source.rows("scene 4"));
  expect(scene4.map((r) => r.id)).toEqual(["place:scene:s4"]);
});

test("preferences keyboard finds app.shortcuts and extraMatch surfaces numeric commands with trailing values", () => {
  const ctx: CommandContext = {
    screen: "document",
    focus: "page",
    docOpen: true,
    role: "owner",
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
    zoom: "fit_width",
    zoomPercent: 100,
    production: null,
    docKind: "script",
    projectKind: "film",
    outlineStart: false,
    writing: null,
    material: null,
    rundown: null,
    prompter: null,
    inTrash: false,
    canDelete: true,
    focusMode: false,
    readingAloud: false,
    sprintRunning: false,
  };
  const personal = createMemoryBag({ initial: {}, writable: () => true });
  const device = createMemoryBag({ initial: {}, writable: () => true });
  const script = createMemoryBag({ initial: {}, writable: () => true });
  const project = createMemoryBag({ initial: {}, writable: () => true });
  const settings = createSettingsStore({
    registry: SETTINGS,
    bags: { personal, device, script, project },
    beforeWrite: () => {},
    deferRemote: (apply) => apply(),
    locked: () => false,
  });
  const handlers = Object.fromEntries(
    COMMANDS.filter((c) => c.setting === null).map((c) => [c.id, () => {}]),
  ) as CommandHandlers;
  const service = createCommandService({
    commands: COMMANDS,
    context: () => ctx,
    settings,
    handlers,
    bindings: () => new Map(),
    onDisabled: () => {},
  });
  const source = createCommandSource({
    commands: COMMANDS,
    service,
    platform: "mac",
    shell: "web",
    extraMatch: (query, id) =>
      parseNumericCommandQuery(query)?.commandId === id,
  });

  expect(source.rows("preferences keyboard").map((r) => r.id)).toContain(
    "app.shortcuts",
  );
  expect(source.rows("lines 50").map((r) => r.id)).toEqual([
    "doc.linesPerPage",
  ]);
  expect(source.rows("target 110").map((r) => r.id)).toEqual([
    "project.targetPages",
  ]);
});
