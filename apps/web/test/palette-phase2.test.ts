import { beforeEach, expect, test } from "bun:test";
import type { CommandContext, RecommendationSignals } from "@manent/commands";
import type { Pagination } from "@manent/pagination";
import {
  SETTINGS,
  createMemoryBag,
  createSettingsStore,
} from "@manent/settings";
import { createMessageQueue, createValue } from "@manent/ui";
import {
  askLinesPerPage,
  askReadRate,
  askTargetPages,
} from "../src/handlers/numeric-settings.ts";
import type { HandlerDeps } from "../src/handlers/index.ts";
import { checksHandlers } from "../src/handlers/checks.ts";
import { documentHandlers } from "../src/handlers/document.ts";
import { preferencesHandlers } from "../src/handlers/preferences.ts";
import { seriesHandlers } from "../src/handlers/series.ts";
import {
  consumeChecksOpen,
  hasPendingChecksOpen,
} from "../src/screens/document/checks-part.ts";
import type { LibraryIndex } from "../src/services/ports.ts";
import { computeQuickJumps } from "../src/shell/palette-jumps.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import {
  paletteActions,
  selectors as paletteSelectors,
} from "../src/state/palette.store.ts";
import { panelsActions } from "../src/state/panels.store.ts";
import { QUIET_DOM } from "./services.fixtures.ts";

beforeEach(() => {
  bindGuard(createGuard({ flavour: "test" }));
});

const BASE_CTX: CommandContext = {
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
  zoom: "fit_width",
  zoomPercent: 100,
  production: null,
  docKind: "script",
  projectKind: "film",
  outlineStart: false,
  writing: { position: "everyone", othersHaveAccess: true },
  material: { caretInSpeech: true, alternates: 0, selection: false, cuts: 0 },
  rundown: null,
  prompter: null,
  inTrash: false,
  canDelete: true,
  focusMode: false,
  readingAloud: false,
  sprintRunning: false,
};

const noLibrary = {
  continueList: () => createValue([]),
  documentProject: () => createValue("proj-1"),
} as unknown as LibraryIndex;

function makeDeps(
  options: { locked?: boolean; writableProject?: boolean } = {},
) {
  const personal = createMemoryBag({ initial: {}, writable: () => true });
  const device = createMemoryBag({ initial: {}, writable: () => true });
  const script = createMemoryBag({ initial: {}, writable: () => true });
  const project = createMemoryBag({
    initial: {},
    writable: () => options.writableProject ?? true,
  });
  const store = createSettingsStore({
    registry: SETTINGS,
    bags: { personal, device, script, project },
    beforeWrite: () => {},
    deferRemote: (apply) => apply(),
    locked: () => options.locked === true,
  });
  const messages = createMessageQueue({
    now: () => 1000,
    schedule: () => () => {},
  });
  const reverses = new Map<string, () => void>();
  const navigated: string[] = [];
  const focused: string[] = [];
  const deps = {
    language: "en-GB",
    now: () => 1000,
    storage: null,
    services: {
      openScriptStore: () => store,
      messages,
      reverses: {
        set: (id: string, fn: () => void) => reverses.set(id, fn),
        run: (id: string) => {
          const fn = reverses.get(id);
          if (fn === undefined) return false;
          reverses.delete(id);
          fn();
          return true;
        },
      },
      library: noLibrary,
      lastPane: { get: () => "writing", set: () => {} },
    },
    router: {
      navigate: (href: string) => navigated.push(href),
      here: () => ({ routeId: "/s/$docId", href: "/s/doc-1", search: {} }),
    },
    dom: {
      ...QUIET_DOM,
      focusLeftPanel: () => focused.push("left"),
      focusSidePanel: (within?: string) => focused.push(`side:${within ?? ""}`),
    },
    shellState: () => ({
      screen: "document" as const,
      docId: "doc-1",
      panels: { left: null, side: null },
      historyPresent: true,
      spaceBeforeSet: false,
    }),
    frame: (fn: () => void) => {
      fn();
      return () => {};
    },
    visitUndo: { current: null },
    desktop: null,
    nodeCloud: null,
  } as unknown as HandlerDeps;
  return { deps, store, messages, reverses, navigated, focused };
}

test("Track 1 direct navigation handlers open panel tabs, Checks, Series Board and Preferences panes", () => {
  const { deps, navigated, focused } = makeDeps();
  const doc = documentHandlers(deps);
  doc["view.scenes"]();
  expect(panelsActions.get().left.tab).toBe("scenes");
  doc["view.cuts"]();
  expect(panelsActions.get().left.tab).toBe("cuts");
  doc["view.comments"]();
  expect(panelsActions.get().side.tab).toBe("comments");
  doc["view.details"]();
  expect(panelsActions.get().side.tab).toBe("details");

  checksHandlers(deps)["checks.open"]();
  expect(hasPendingChecksOpen()).toBe(true);
  expect(consumeChecksOpen()).toBe(true);

  seriesHandlers(deps)["series.openBoard"]();
  const prefs = preferencesHandlers(deps);
  prefs["app.preferencesAppearance"]();
  prefs["app.preferencesWriting"]();
  prefs["app.preferencesAccount"]();
  prefs["app.preferencesDevice"]();

  expect(navigated).toEqual([
    "/p/proj-1/board?ep=doc-1",
    "/preferences/appearance?from=%2Fs%2Fdoc-1",
    "/preferences/writing?from=%2Fs%2Fdoc-1",
    "/preferences/account?from=%2Fs%2Fdoc-1",
    "/preferences/device?from=%2Fs%2Fdoc-1",
  ]);
  expect(focused.slice(0, 4)).toEqual(["left", "left", "side:", "side:"]);
});

test("Track 2 numeric setting asks validate input, respect locked layout, announce changes and register Undo", () => {
  const { deps, store, messages, reverses } = makeDeps();

  // Locked layout refuses without opening ask
  const locked = makeDeps({ locked: true });
  paletteActions.close();
  askLinesPerPage(locked.deps);
  expect(paletteSelectors.ask()).toBeNull();
  expect(locked.messages.current()?.text).toContain("locked");

  // Lines per page: invalid -> brief error message; valid -> writes + Undo; empty -> resets to null
  askLinesPerPage(deps);
  const linesAsk = paletteSelectors.ask();
  expect(linesAsk?.allowEmpty).toBe(true);
  linesAsk?.submit("999");
  expect(store.get("script.linesPerPage")).toBeNull();
  expect(messages.current()?.id).toBe("lines_per_page_invalid");
  messages.dismiss("lines_per_page_invalid");

  linesAsk?.submit("50");
  expect(store.get("script.linesPerPage")).toBe(50);
  const changedId = messages.current()?.id ?? "";
  expect(changedId).toBe("setting_changed");
  expect(reverses.has(changedId)).toBe(true);
  reverses.get(changedId)?.();
  expect(store.get("script.linesPerPage")).toBeNull();
  messages.dismiss("setting_changed");

  linesAsk?.submit("52");
  expect(store.get("script.linesPerPage")).toBe(52);
  messages.dismiss("setting_changed");
  linesAsk?.submit("");
  expect(store.get("script.linesPerPage")).toBeNull();
  messages.dismiss("setting_changed");

  // Read rate: valid decimal and invalid refusal
  askReadRate(deps);
  const rateAsk = paletteSelectors.ask();
  expect(rateAsk?.allowEmpty).toBe(false);
  rateAsk?.submit("80");
  expect(messages.current()?.id).toBe("read_rate_invalid");
  messages.dismiss("read_rate_invalid");
  rateAsk?.submit("12.5");
  expect(store.get("project.readRate")).toBe(12.5);
  messages.dismiss("setting_changed");

  // Target length: valid integer, invalid refusal, empty reset
  askTargetPages(deps);
  const targetAsk = paletteSelectors.ask();
  expect(targetAsk?.allowEmpty).toBe(true);
  targetAsk?.submit("0");
  expect(messages.current()?.id).toBe("target_pages_invalid");
  messages.dismiss("target_pages_invalid");
  targetAsk?.submit("110");
  expect(store.get("project.targetPages")).toBe(110);
  messages.dismiss("setting_changed");
  targetAsk?.submit("");
  expect(store.get("project.targetPages")).toBeNull();

  // Read-only project refuses Read rate and Target length
  const ro = makeDeps({ writableProject: false });
  askReadRate(ro.deps);
  expect(ro.messages.current()?.text).toContain("owner");
  askTargetPages(ro.deps);
  expect(ro.messages.current()?.text).toContain("owner");
  paletteActions.close();
});

test("Track 3 computeQuickJumps surfaces Library Continue scripts, next line for multi-cue speakers and collaborators", () => {
  const library = {
    continueList: (wsId: string) =>
      createValue(
        wsId === "ws-1"
          ? [
              {
                docId: "d1",
                title: "One",
                projectTitle: "P1",
                kind: "film",
                place: { kind: "synced" },
              },
              {
                docId: "d2",
                title: "Two",
                projectTitle: "P2",
                kind: "film",
                place: { kind: "synced" },
              },
              {
                docId: "d3",
                title: "Three",
                projectTitle: "P3",
                kind: "film",
                place: { kind: "synced" },
              },
              {
                docId: "d4",
                title: "Four",
                projectTitle: "P4",
                kind: "film",
                place: { kind: "synced" },
              },
            ]
          : [],
      ),
  } as unknown as LibraryIndex;

  const libSignals: RecommendationSignals = {
    command: { ...BASE_CTX, screen: "library", docOpen: false },
  };
  expect(
    computeQuickJumps({
      signals: libSignals,
      userId: "sam",
      workspaceIds: ["ws-1"],
      library,
      pagination: () => null,
      caretBlockId: null,
      people: [],
    }),
  ).toEqual(["document:d1", "document:d2", "document:d3"]);

  const pagination = {
    blocks: [
      { id: "b1", type: "character", text: "MAREN (V.O.)" },
      { id: "b2", type: "dialogue", text: "Keep the light steady." },
      { id: "b3", type: "character", text: "OTTO" },
      { id: "b4", type: "dialogue", text: "Always." },
      { id: "b5", type: "character", text: "MAREN (CONT'D)" },
      { id: "b6", type: "dialogue", text: "Wait for the tide." },
    ],
    pages: [],
  } as unknown as Pagination;

  // Multi-cue speaker MAREN gets place:line:MAREN + collaborator Dana (excluding self Sam)
  expect(
    computeQuickJumps({
      signals: { command: BASE_CTX, caretElement: "dialogue" },
      userId: "sam",
      workspaceIds: [],
      library: noLibrary,
      pagination: () => pagination,
      caretBlockId: "b2",
      people: [
        { userId: "sam", name: "Sam", color: 1, blockId: "b2", active: true },
        { userId: "dana", name: "Dana", color: 2, blockId: "b4", active: true },
      ] as never,
    }),
  ).toEqual(["place:line:MAREN", "person:dana"]);

  // Single-cue speaker OTTO does not get a no-op next-line jump
  expect(
    computeQuickJumps({
      signals: { command: BASE_CTX, caretElement: "dialogue" },
      userId: "sam",
      workspaceIds: [],
      library: noLibrary,
      pagination: () => pagination,
      caretBlockId: "b4",
      people: [],
    }),
  ).toEqual([]);
});
