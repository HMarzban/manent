import { expect, test } from "bun:test";
import {
  SETTINGS,
  createMemoryBag,
  createSettingsStore,
} from "@manent/settings";
import {
  COMMANDS,
  PALETTE_SYNONYMS,
  contextBoost,
  createCommandService,
  frecencyScore,
  recommendPalette,
  recordUsage,
} from "../src/index.ts";
import type {
  CommandContext,
  CommandUsage,
  RecommendationSignals,
} from "../src/index.ts";

const NOW = 1_760_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  material: {
    caretInSpeech: false,
    alternates: 0,
    selection: false,
    cuts: 0,
  },
  rundown: null,
  prompter: null,
  inTrash: false,
  canDelete: true,
  focusMode: false,
  readingAloud: false,
  sprintRunning: false,
};

const bag = () => createMemoryBag({ initial: {}, writable: () => true });

function makeService(ctx: CommandContext) {
  const settings = createSettingsStore({
    registry: SETTINGS,
    bags: { personal: bag(), device: bag(), script: bag(), project: null },
    beforeWrite: () => {},
    deferRemote: (apply) => apply(),
    locked: () => false,
  });
  const service = createCommandService({
    commands: COMMANDS,
    handlers: Object.fromEntries(
      COMMANDS.filter((c) => c.setting === null).map((c) => [c.id, () => {}]),
    ),
    context: () => ctx,
    settings,
    bindings: () => new Map(),
    onDisabled: () => {},
  });
  const known = new Set<string>(COMMANDS.map((c) => c.id));
  return {
    service,
    available: (id: string) => (known.has(id) ? service.state(id) : null),
  };
}

test("scene numbers choice commands carry a clear standalone heading and game elements stay scoped to Game format", () => {
  const { service } = makeService(BASE_CTX);
  expect([
    service.state("setting.script.sceneNumbers.none").label,
    service.state("setting.script.sceneNumbers.left").label,
    service.state("setting.script.sceneNumbers.both").label,
    service.state("element.emote").visible,
    service.state("element.camera").visible,
    service.state("element.engineDirection").visible,
  ]).toEqual([
    "Scene numbers: None",
    "Scene numbers: Left",
    "Scene numbers: Left and right",
    false,
    false,
    false,
  ]);
  const game = makeService({ ...BASE_CTX, format: "game" }).service;
  expect([
    game.state("element.emote").visible,
    game.state("element.camera").visible,
    game.state("element.engineDirection").visible,
  ]).toEqual([true, true, true]);
});

test("every synonym entry maps to a registered command id and never introduces an extra 'int' prefix match", () => {
  const ids = new Set<string>(COMMANDS.map((c) => c.id));
  const unknown = Object.keys(PALETTE_SYNONYMS).filter((id) => !ids.has(id));
  const intMatches = Object.entries(PALETTE_SYNONYMS).flatMap(([id, words]) =>
    words
      .flatMap((phrase) => phrase.toLocaleLowerCase().split(/\s+/))
      .filter((word) => word.startsWith("int"))
      .map((word) => `${id}:${word}`),
  );
  expect({ unknown, intMatches }).toEqual({ unknown: [], intMatches: [] });
});

test("screenplay contexts tailor suggested actions and quick settings to body, dialogue, selection and title page", () => {
  const body = makeService(BASE_CTX);
  const bodyRec = recommendPalette({
    signals: { command: BASE_CTX, resolvedDark: true },
    usage: [],
    available: body.available,
    now: NOW,
  });
  expect(bodyRec.suggested).toEqual([
    "history.open",
    "doc.openBeside",
    "doc.export",
    "history.nameDraft",
  ]);
  expect(bodyRec.quickSettings).toEqual([
    "setting.writing.typewriterScrolling",
    "setting.appearance.whitePage",
    "setting.appearance.theme.light",
  ]);

  const speechCtx: CommandContext = {
    ...BASE_CTX,
    material: { caretInSpeech: true, alternates: 2, selection: false, cuts: 0 },
  };
  const speech = makeService(speechCtx);
  const speechRec = recommendPalette({
    signals: {
      command: speechCtx,
      caretElement: "dialogue",
      resolvedDark: false,
    },
    usage: [],
    available: speech.available,
    now: NOW,
  });
  expect(speechRec.suggested.slice(0, 3)).toEqual([
    "alternate.show",
    "alternate.add",
    "format.dualDialogue",
  ]);
  expect(speechRec.quickSettings.slice(0, 2)).toEqual([
    "setting.script.sameSpeakerContd",
    "setting.script.moresAtBreaks",
  ]);

  const selCtx: CommandContext = {
    ...BASE_CTX,
    material: { caretInSpeech: false, alternates: 0, selection: true, cuts: 0 },
  };
  const sel = makeService(selCtx);
  expect(
    recommendPalette({
      signals: { command: selCtx, hasSelection: true },
      usage: [],
      available: sel.available,
      now: NOW,
    }).suggested.slice(0, 3),
  ).toEqual(["comment.add", "note.add", "material.moveToCuts"]);

  const titleRec = recommendPalette({
    signals: { command: BASE_CTX, inTitlePage: true },
    usage: [],
    available: body.available,
    now: NOW,
  });
  expect(titleRec.suggested.slice(0, 3)).toEqual([
    "format.titlePage",
    "doc.rename",
    "doc.scriptSettings",
  ]);
});

test("locked production, rundown, ink, library, history and offline states surface their highest-leverage actions", () => {
  const lockedCtx: CommandContext = {
    ...BASE_CTX,
    production: {
      locked: true,
      canLock: true,
      canIssue: true,
      recallOpen: true,
      waiting: 0,
      activeName: "Pink",
      recallName: "Blue",
      selection: "text",
      mode: "collated",
      tint: false,
    },
  };
  const locked = makeService(lockedCtx);
  expect(
    recommendPalette({
      signals: { command: lockedCtx },
      usage: [],
      available: locked.available,
      now: NOW,
    }).suggested,
  ).toEqual([
    "production.recall",
    "production.issue",
    "production.markRevised",
    "production.clearRevised",
  ]);

  const rundownCtx: CommandContext = {
    ...BASE_CTX,
    docKind: "rundown",
    projectKind: "news",
    format: null,
    rundown: {
      canEdit: true,
      selectedRows: 1,
      scriptRowSelected: true,
      editingCell: false,
    },
    prompter: {
      canSend: true,
      hasStory: true,
      sentBefore: false,
      storyFormat: "variety",
      waiting: 0,
      synced: true,
      controlling: false,
    },
  };
  const rundown = makeService(rundownCtx);
  expect(
    recommendPalette({
      signals: { command: rundownCtx },
      usage: [],
      available: rundown.available,
      now: NOW,
    }).suggested,
  ).toEqual([
    "rundown.openBeside",
    "prompter.send",
    "prompter.takeControl",
    "rundown.addRow",
  ]);

  const inkCtx: CommandContext = {
    ...BASE_CTX,
    format: "ink",
    docKind: "ink",
    projectKind: "game",
  };
  const ink = makeService(inkCtx);
  expect(
    recommendPalette({
      signals: { command: inkCtx, besideOpen: false },
      usage: [],
      available: ink.available,
      now: NOW,
    }).suggested.slice(0, 2),
  ).toEqual(["ink.play", "ink.playFromHere"]);

  const libraryCtx: CommandContext = {
    ...BASE_CTX,
    screen: "library",
    docOpen: false,
    role: null,
    format: null,
    docKind: null,
    projectKind: null,
    writing: null,
    material: null,
  };
  const library = makeService(libraryCtx);
  expect(
    recommendPalette({
      signals: { command: libraryCtx },
      usage: [],
      available: library.available,
      now: NOW,
    }).suggested,
  ).toEqual([
    "library.newScript",
    "library.newProject",
    "file.import",
    "library.search",
  ]);

  const offlineCtx: CommandContext = { ...BASE_CTX, online: false };
  const offline = makeService(offlineCtx);
  expect(
    recommendPalette({
      signals: { command: offlineCtx },
      usage: [],
      available: offline.available,
      now: NOW,
    }).suggested.slice(0, 3),
  ).toEqual(["app.syncCentre", "doc.export", "history.markVersion"]);

  const history = makeService(BASE_CTX);
  expect(
    recommendPalette({
      signals: {
        command: BASE_CTX,
        historyScreen: true,
        historyComparing: true,
      },
      usage: [],
      available: history.available,
      now: NOW,
    }).suggested.slice(0, 3),
  ).toEqual([
    "history.nextChange",
    "history.previousChange",
    "history.nameDraft",
  ]);
});

test("recent recommendations are deduplicated against suggested and quick settings, ignore noise ids and decay with time", () => {
  let usage: readonly CommandUsage[] = [];
  usage = recordUsage(usage, "app.palette", "document", NOW);
  usage = recordUsage(usage, "edit.undo", "document", NOW);
  usage = recordUsage(usage, "history.open", "document", NOW);
  usage = recordUsage(
    usage,
    "script.renameCharacter",
    "document",
    NOW - 10 * DAY_MS,
  );
  usage = recordUsage(usage, "readAloud.start", "document", NOW - 1000);
  usage = recordUsage(usage, "script.reports", "library", NOW - 2000);

  expect(usage.map((u) => u.id)).not.toContain("app.palette");
  expect(usage.map((u) => u.id)).not.toContain("edit.undo");
  expect(
    frecencyScore(
      usage.find((u) => u.id === "readAloud.start")!,
      "document",
      NOW,
    ),
  ).toBeGreaterThan(
    frecencyScore(
      usage.find((u) => u.id === "script.renameCharacter")!,
      "document",
      NOW,
    ),
  );

  const doc = makeService(BASE_CTX);
  const rec = recommendPalette({
    signals: { command: BASE_CTX },
    usage,
    available: doc.available,
    now: NOW,
  });
  expect(rec.suggested).toContain("history.open");
  expect(rec.recent).not.toContain("history.open");
  expect(rec.recent[0]).toBe("readAloud.start");
});

test("contextBoost demotes inactive history commands off the History screen and boosts matching studio palettes", () => {
  const signals: RecommendationSignals = {
    command: BASE_CTX,
    historyScreen: false,
    historyComparing: false,
  };
  expect(contextBoost("history.restore", signals, [], NOW)).toBeLessThan(0);
  expect(
    contextBoost("setting.appearance.palette.hyperdrive", signals, [], NOW),
  ).toBeGreaterThan(
    contextBoost("setting.appearance.palette.newsdesk", signals, [], NOW),
  );
  expect(
    contextBoost(
      "history.restore",
      { ...signals, historyScreen: true },
      [],
      NOW,
    ),
  ).toBeGreaterThan(0);
});
