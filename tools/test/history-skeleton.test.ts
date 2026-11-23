import { expect, test } from "bun:test";
import { COMMANDS } from "@manent/commands";
import type { CommandContext, CommandDefinition } from "@manent/commands";
import type { VersionItem } from "@manent/sync-protocol";
import {
  HISTORY_WORDS,
  PLACE_WORDS,
  escapeAction,
  formatPosition,
  historyMessage,
  versionRef,
  versionTitle,
} from "@manent/ui";
import type { EscapeSnapshot, HistoryMessage } from "@manent/ui";
import { dirname, join } from "node:path";
import { checkStrings, interfaceStrings } from "../check-glossary.ts";

const repoRoot = join(import.meta.dir, "..", "..");

const MON_16_NOV_2026 = Date.UTC(2026, 10, 16, 12);
const NOV_16_2025 = Date.UTC(2025, 10, 16, 12);
const NOW = Date.UTC(2026, 10, 18, 12);
const DAY_MS = 86_400_000;

const SNAP: EscapeSnapshot = {
  composing: false,
  popoverOpen: false,
  dialogOpen: false,
  fieldOpen: false,
  filterWithText: false,
  focus: "frame",
  overlayPanelOpen: false,
  viewingVersion: false,
};

/** Each folder entry of the history work, with the modules it names in order. */
const ENTRIES: Readonly<Record<string, readonly string[]>> = {
  "packages/revisions/src/compare/index.ts": [
    "align.ts",
    "block-changes.ts",
    "changed-lines.ts",
    "compare-mode.ts",
    "comparison.ts",
    "invert.ts",
    "slice.ts",
    "token-encoder.ts",
  ],
  "packages/revisions/src/restore/index.ts": [
    "plan-restore.ts",
    "scene-blocks.ts",
  ],
  "packages/server-core/src/history/index.ts": [
    "attribution.ts",
    "chunks.ts",
    "content.ts",
    "maintenance.ts",
    "restore.ts",
    "service.ts",
    "sessions.ts",
    "snapshot.ts",
    "summaries.ts",
    "thinning.ts",
  ],
  "packages/sync-client/src/history/index.ts": [
    "local-restore.ts",
    "upload.ts",
  ],
  "packages/editor/src/changes/index.ts": [
    "decorations.ts",
    "layer.ts",
    "plugin.ts",
  ],
};

const MODULES = [
  "packages/crdt/src/restore-origin.ts",
  "packages/server-core/src/http/routes/history.ts",
  "packages/ui/src/words/history.ts",
  "packages/commands/src/definitions/history.ts",
  ...[
    "source.ts",
    "content-cache.ts",
    "baseline.ts",
    "restore-flow.ts",
    "facts.ts",
    "last-opened.ts",
    "row-extensions.ts",
    "version-layouts.ts",
  ].map((file) => `apps/web/src/history/${file}`),
  "apps/web/src/state/history.store.ts",
  "apps/web/src/handlers/history.ts",
  "apps/web/src/editor-host/version-view.ts",
  "apps/web/src/editor-host/changes.ts",
  ...[
    "history-list",
    "history-changes",
    "history-row-menu",
    "version-pane",
    "who-wrote",
  ].map((name) => `apps/web/src/screens/document/${name}.tsx`),
];

/** Each list the history work registers in, with the text of its line, held once. */
const REGISTRATIONS: readonly (readonly [string, string])[] = [
  ["packages/revisions/src/index.ts", 'export * from "./compare/index.ts";'],
  ["packages/revisions/src/index.ts", 'export * from "./restore/index.ts";'],
  [
    "packages/crdt/src/index.ts",
    'export { ORIGIN_RESTORE } from "./restore-origin.ts";',
  ],
  ["packages/server-core/src/index.ts", 'export * from "./history/index.ts";'],
  ["packages/server-core/src/http/routes/index.ts", "...historyRoutes,"],
  ["packages/sync-client/src/index.ts", 'export * from "./history/index.ts";'],
  ["packages/editor/src/index.ts", 'export * from "./changes/index.ts";'],
  ["packages/ui/src/words/index.ts", 'export * from "./history.ts";'],
  ["packages/commands/src/definitions/index.ts", "...HISTORY_COMMANDS,"],
  ["apps/web/src/handlers/index.ts", "...historyHandlers(deps),"],
  ["apps/web/src/editor-host/plugins.ts", "() => changesPlugin()"],
  [
    "apps/web/src/screens/document/history-sections.ts",
    '{ id: "versions", Section: HistoryList, useVisible: () => true }',
  ],
  ["apps/web/src/screens/document/state-facts.ts", "  useHistoryFacts,\n"],
  [
    "apps/web/src/screens/document/details-sections.ts",
    '{ id: "who_wrote", scope: "selection", Section: WhoWrote }',
  ],
];

const read = (file: string): Promise<string> =>
  Bun.file(join(repoRoot, file)).text();

/** The modules an entry's lines name; a line of any other form stays as it is, so it names no module. */
const namedModules = async (entry: string): Promise<string[]> =>
  (await read(entry))
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("//"))
    .map(
      (line) =>
        new RegExp('^export \\* from "\\./([a-z][a-z0-9-]*\\.ts)";$').exec(
          line,
        )?.[1] ?? line,
    );

const timesHeld = async (file: string, line: string): Promise<number> =>
  (await read(file)).split(line).length - 1;

/** Every literal of the history words, each template's values read as `{}`. */
const historyStrings = async () =>
  (await interfaceStrings(repoRoot)).filter(
    (source) => source.file === "packages/ui/src/words/history.ts",
  );

const item = (over: Partial<VersionItem>): VersionItem => ({
  id: "v1",
  kind: "auto",
  name: null,
  createdByUserId: "dana",
  createdAt: new Date(2026, 10, 16, 14, 10).getTime(),
  onDevice: false,
  position: null,
  engineVersion: null,
  summary: null,
  ...over,
});
const nameOf = (userId: string): string =>
  userId === "dana" ? "Dana" : userId;

/** What a message says and offers, how long it stays, and whether it is about the person's own work. */
const said = (message: HistoryMessage) => {
  const { text, actions, lifetime, ownWork } = historyMessage(message, "m");
  return [text, actions.map((a) => a.commandId), lifetime, ownWork];
};

const CTX: CommandContext = {
  screen: "document",
  focus: "page",
  docOpen: true,
  role: "editor",
  online: true,
  platform: "mac",
  shell: "web",
  demo: false,
  signedIn: true,
  panelOpen: { left: false, side: false },
  historyPresent: true,
  format: null,
  rulerShown: false,
  layoutView: "page",
  spaceBeforeSet: false,
  zoom: null,
  zoomPercent: null,
  docKind: null,
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
};
// History and Review are declared with the View and sync commands
const DECLARED_ELSEWHERE = new Set(["history.open", "history.review"]);
const historyCommands = COMMANDS.filter(
  (c) => c.id.startsWith("history.") && !DECLARED_ELSEWHERE.has(c.id),
);
const visibleTo = (c: CommandDefinition, over: Partial<CommandContext>) =>
  c.visible === null || c.visible({ ...CTX, ...over });

test("every history folder entry names only modules that exist, and each list is registered once", async () => {
  for (const [entry, modules] of Object.entries(ENTRIES)) {
    expect({ entry, modules: await namedModules(entry) }).toEqual({
      entry,
      modules: [...modules],
    });
    for (const module of modules) {
      const file = join(dirname(entry), module);
      expect({
        file,
        exists: await Bun.file(join(repoRoot, file)).exists(),
      }).toEqual({ file, exists: true });
    }
  }
  for (const file of MODULES)
    expect({
      file,
      exists: await Bun.file(join(repoRoot, file)).exists(),
    }).toEqual({ file, exists: true });
  for (const [file, line] of REGISTRATIONS)
    expect({ file, line, times: await timesHeld(file, line) }).toEqual({
      file,
      line,
      times: 1,
    });
});

test("the history words are the sentences people read", async () => {
  const draft = "'Table read draft'";
  expect(HISTORY_WORDS.restoreBody).toBe(
    "The script as it is now is kept as 'Before restore'.",
  );
  expect(HISTORY_WORDS.restoredYou(draft)).toBe(
    "Restored 'Table read draft'. The script as it was is kept as 'Before restore'.",
  );
  expect(HISTORY_WORDS.restoredYou("the version from Mon 14:10")).toBe(
    "Restored the version from Mon 14:10. The script as it was is kept as 'Before restore'.",
  );
  expect(HISTORY_WORDS.restoredBy("Dana", draft, "14:32")).toBe(
    "Dana restored 'Table read draft' at 14:32. Your later changes are kept.",
  );
  expect([
    HISTORY_WORDS.restoreSceneTitle("8", draft),
    HISTORY_WORDS.restoreSceneBody("8"),
    HISTORY_WORDS.restoreSceneButton("8"),
  ]).toEqual([
    "Restore scene 8 from 'Table read draft'?",
    "Scene 8 as it is now is kept in 'Before restore'. The rest of the script is unchanged.",
    "Restore scene 8",
  ]);
  expect(HISTORY_WORDS.restoredSceneYou("8", draft)).toBe(
    "Restored scene 8 from 'Table read draft'. The script as it was is kept as 'Before restore'.",
  );
  expect(HISTORY_WORDS.refused(draft)).toBe(
    "Couldn't restore 'Table read draft': that version can no longer be restored. Open it with As it was and copy what you need.",
  );
  expect([
    HISTORY_WORDS.summary(31, 4),
    HISTORY_WORDS.summary(1, 1),
    HISTORY_WORDS.summary(3, 0),
  ]).toEqual(["31 changes, 4 scenes", "1 change, 1 scene", "3 changes"]);
  expect(
    HISTORY_WORDS.writtenBy("Dana", "Today 14:10", "No one has crossed"),
  ).toBe("Written by Dana, Today 14:10 · previously No one has crossed");
  expect([
    HISTORY_WORDS.writtenBefore("Dana", "Mon 14:10"),
    HISTORY_WORDS.noAuthor,
  ]).toEqual([
    "Written by Dana, before Mon 14:10",
    "No author recorded: this text came in with an import or before its history was kept.",
  ]);
  expect(HISTORY_WORDS.namedByOther("Dana", "Studio draft")).toBe(
    "Dana named a draft: 'Studio draft'.",
  );
  expect([
    PLACE_WORDS.scene("8", "INT. FERRY - NIGHT"),
    HISTORY_WORDS.stepName(3, 41),
    formatPosition(3, 41),
  ]).toEqual(["Sc. 8 · INT. FERRY - NIGHT", "Change 3 of 41", "3 of 41"]);
  expect([
    HISTORY_WORDS.dayGroup(MON_16_NOV_2026, NOW),
    HISTORY_WORDS.dayGroup(NOV_16_2025, NOW),
    HISTORY_WORDS.dayGroup(NOW, NOW),
    HISTORY_WORDS.dayGroup(NOW - DAY_MS, NOW),
  ]).toEqual(["Mon 16 Nov", "16 Nov 2025", "Today", "Yesterday"]);
  expect([HISTORY_WORDS.ordinals[9], HISTORY_WORDS.draftNumber(11)]).toEqual([
    "Tenth draft",
    "Draft 11",
  ]);
  expect(HISTORY_WORDS.working("you", "14:10")).toBe("Working — you, 14:10");
  expect(HISTORY_WORDS.compareEngines).toBe(
    "Changes are shown by text and element only: these were laid out by different layout engines, so page breaks may differ.",
  );
  expect([
    HISTORY_WORDS.problem,
    HISTORY_WORDS.savedYou,
    HISTORY_WORDS.nameFailed,
    HISTORY_WORDS.tryAgain,
  ]).toEqual([
    "Couldn't load older versions. Showing what is on this device.",
    "Saved by you.",
    "Couldn't name this draft.",
    "Try again",
  ]);
  expect(historyMessage({ kind: "restored_you", ref: draft }, "m1")).toEqual({
    id: "m1",
    text: "Restored 'Table read draft'. The script as it was is kept as 'Before restore'.",
    actions: [
      { label: "Restore 'Before restore'", commandId: "history.restoreBefore" },
    ],
    lifetime: "reverse",
    ownWork: false,
  });
  // the glossary check: no banned word, every noun a term
  expect(checkStrings(await historyStrings())).toEqual([]);
});

test("each history message keeps its time, its actions and whose work it is", () => {
  const ref = "'Table read draft'";
  const messages: readonly HistoryMessage[] = [
    { kind: "restored_scene_you", scene: "8", ref },
    { kind: "restored_by", name: "Dana", ref, time: "14:32" },
    { kind: "restored_scene_by", name: "Dana", scene: "8", ref, time: "14:32" },
    { kind: "refused", ref },
    { kind: "saved_you" },
    { kind: "named_by_other", name: "Dana", draft: "Studio draft" },
  ];
  expect(messages.map(said)).toEqual([
    [
      "Restored scene 8 from 'Table read draft'. The script as it was is kept as 'Before restore'.",
      ["history.restoreBefore"],
      "reverse",
      false,
    ],
    [
      "Dana restored 'Table read draft' at 14:32. Your later changes are kept.",
      ["history.seeWhatChanged"],
      "until_dismissed",
      true,
    ],
    [
      "Dana restored scene 8 from 'Table read draft' at 14:32. Your later changes are kept.",
      ["history.seeWhatChanged"],
      "until_dismissed",
      true,
    ],
    [
      "Couldn't restore 'Table read draft': that version can no longer be restored. Open it with As it was and copy what you need.",
      [],
      "until_dismissed",
      false,
    ],
    ["Saved by you.", [], "brief", false],
    ["Dana named a draft: 'Studio draft'.", [], "brief", false],
  ]);
});

test("a version is named by its name, its label or its time", () => {
  const named = item({ kind: "named", name: "Table read draft" });
  const saved = item({ kind: "saved", createdByUserId: "sam" });
  const before = item({ kind: "pre_restore" });
  const reconnect = item({ kind: "pre_merge", onDevice: true });
  const recovered = item({ kind: "recovered", onDevice: true });
  const auto = item({ kind: "auto" });
  expect(
    [named, saved, before, reconnect, recovered, auto].map((v) =>
      versionTitle(v, "sam", nameOf),
    ),
  ).toEqual([
    "Table read draft",
    "Saved by you",
    "Before restore",
    "Before reconnect — this device",
    "Recovered — this device",
    "Mon 14:10",
  ]);
  expect(versionTitle(saved, "dana", nameOf)).toBe("Mon 14:10");
  expect(
    [named, before, reconnect, recovered, saved, auto].map((v) =>
      versionRef(v, nameOf),
    ),
  ).toEqual([
    "'Table read draft'",
    "'Before restore'",
    "'Before reconnect — this device'",
    "'Recovered — this device'",
    "the version from Mon 14:10",
    "the version from Mon 14:10",
  ]);
});

test("the history commands sit in these menus, answer these palette words and appear to people who can use them", () => {
  expect(
    historyCommands.map((c) => [c.id, c.menus, c.palette, c.opens]),
  ).toEqual([
    [
      "history.markVersion",
      [{ menu: "file", group: "history", order: 20, submenu: null }],
      { keywords: ["snapshot", "backup"] },
      null,
    ],
    [
      "history.nameDraft",
      [
        { menu: "file", group: "history", order: 30, submenu: null },
        { menu: "title", group: "drafts", order: 10, submenu: null },
      ],
      { keywords: [] },
      { surface: "name_field", focus: "item" },
    ],
    [
      "history.changesSince",
      [],
      { keywords: ["compare", "diff", "what's new"] },
      null,
    ],
    ["history.hideChanges", [], { keywords: [] }, null],
    ["history.showSinceOpened", [], { hidden: "the state bar's action" }, null],
    ["history.dismissSinceOpened", [], { hidden: "the state bar's ✕" }, null],
    ["history.backToWorking", [], { keywords: [] }, null],
    ["history.nextChange", [], { keywords: [] }, null],
    ["history.previousChange", [], { keywords: [] }, null],
    ["history.restore", [], { keywords: ["revert", "roll back"] }, null],
    ["history.restoreScene", [], { keywords: [] }, null],
    ["history.restoreBefore", [], { keywords: [] }, null],
    ["history.seeWhatChanged", [], { keywords: [] }, null],
    [
      "history.whoWrote",
      [{ menu: "script", group: "who", order: 10, submenu: null }],
      { keywords: [] },
      null,
    ],
  ]);
  expect(
    historyCommands.map((c) => [
      c.id,
      visibleTo(c, { docOpen: false, role: null }),
      visibleTo(c, { role: "viewer" }),
      visibleTo(c, { role: "owner" }),
    ]),
  ).toEqual(
    historyCommands.map((c) => {
      const edits = [
        "history.markVersion",
        "history.nameDraft",
        "history.restore",
        "history.restoreScene",
        "history.restoreBefore",
      ].includes(c.id);
      return [c.id, false, !edits, true];
    }),
  );
  const whoWrote: CommandDefinition = historyCommands.find(
    (c) => c.id === "history.whoWrote",
  )!;
  expect([
    whoWrote.when?.(CTX),
    whoWrote.when?.({ ...CTX, online: false }),
    whoWrote.whyNot?.({ ...CTX, online: false }),
    historyCommands.filter((c) => c.when !== null).map((c) => c.id),
  ]).toEqual([true, false, "needs a connection", ["history.whoWrote"]]);
});

test("Escape returns to Working from the page while a version is viewed", () => {
  expect(escapeAction({ ...SNAP, focus: "page", viewingVersion: true })).toBe(
    "back_to_working",
  );
  expect(escapeAction({ ...SNAP, focus: "page", viewingVersion: false })).toBe(
    "none",
  );
  expect(
    escapeAction({ ...SNAP, popoverOpen: true, viewingVersion: true }),
  ).toBe("close_popover");
});
