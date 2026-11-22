import { expect, test } from "bun:test";
import { PRODUCTION_WORDS } from "@manent/ui";
import { dirname, join } from "node:path";
import { checkStrings } from "../check-glossary.ts";
import type { StringSource } from "../check-glossary.ts";

const repoRoot = join(import.meta.dir, "..", "..");

/** Each folder entry of production revisions, with the modules it names in order. */
const ENTRIES: Readonly<Record<string, readonly string[]>> = {
  "packages/storage/src/production/index.ts": [
    "memory.ts",
    "migration.ts",
    "ports.ts",
    "sqlite.ts",
  ],
  "packages/server-core/src/production/index.ts": [
    "extras.ts",
    "files.ts",
    "hooks.ts",
    "import-lock.ts",
    "import-pages.ts",
    "issue.ts",
    "layout.ts",
    "lock.ts",
    "outcome.ts",
    "pages.ts",
    "ports.ts",
    "recall.ts",
    "requests.ts",
    "service.ts",
    "state.ts",
  ],
  "packages/sync-client/src/production/index.ts": [
    "cache.ts",
    "client.ts",
    "transport.ts",
  ],
  "packages/formats/src/production/index.ts": ["packet.ts"],
  "packages/editor/src/revisions/index.ts": [
    "commands.ts",
    "derive.ts",
    "markers.ts",
    "numbers.ts",
    "pages-feed.ts",
    "plugin.ts",
    "revision-css.ts",
    "sheets.ts",
  ],
  "packages/testkit/src/production/index.ts": ["fixtures.ts", "world.ts"],
};

const MODULES = [
  "packages/sync-protocol/src/production.ts",
  "packages/crdt/src/revised-overrides.ts",
  "packages/server-core/src/http/routes/production.ts",
  "packages/sync-client/src/testing/memory-production.ts",
  "packages/client-web/src/production-cache.ts",
  "packages/client-web/src/production-transport.ts",
  "packages/commands/src/definitions/production.ts",
  "packages/ui/src/words/production.ts",
  ...[
    "services.ts",
    "state-facts.ts",
    "view-state.ts",
    "handlers.ts",
    "lock-dialog.tsx",
    "layout-dialog.tsx",
    "pages-tab.tsx",
    "scene-marks.ts",
    "history-row.ts",
    "version-layout.ts",
    "messages.ts",
    "send/issue-form.tsx",
    "send/recall-form.tsx",
    "send/checks.tsx",
    "send/packet.tsx",
    "send/what-row.tsx",
  ].map((file) => `apps/web/src/production/${file}`),
  "apps/web/src/editor-host/production.ts",
  "apps/web/src/state/production-pages.store.ts",
];

/** Each list production revisions register in, with the text of its line, held once. */
const REGISTRATIONS: readonly (readonly [string, string])[] = [
  ["packages/storage/src/index.ts", 'export * from "./production/index.ts";'],
  ["packages/crdt/src/index.ts", 'export * from "./revised-overrides.ts";'],
  [
    "packages/server-core/src/index.ts",
    'export * from "./production/index.ts";',
  ],
  ["packages/server-core/src/http/routes/index.ts", "...productionRoutes,"],
  [
    "packages/sync-client/src/index.ts",
    'export * from "./production/index.ts";',
  ],
  [
    "packages/sync-client/src/testing/index.ts",
    'export * from "./memory-production.ts";',
  ],
  [
    "packages/client-web/src/index.ts",
    'export * from "./production-cache.ts";',
  ],
  [
    "packages/client-web/src/index.ts",
    'export * from "./production-transport.ts";',
  ],
  ["packages/formats/src/index.ts", 'export * from "./production/index.ts";'],
  ["packages/editor/src/index.ts", 'export * from "./revisions/index.ts";'],
  ["packages/testkit/src/index.ts", 'export * from "./production/index.ts";'],
  ["packages/commands/src/definitions/index.ts", "...PRODUCTION_COMMANDS,"],
  ["packages/ui/src/words/index.ts", 'export * from "./production.ts";'],
];

/** Each package entry the layout reaches, with the values it gives at run time. */
const ENTRY_VALUES: Readonly<Record<string, readonly string[]>> = {
  "@manent/sync-protocol": [
    "PRODUCTION_STATE_VERSION",
    "NUMBERING_SCHEMES",
    "COLOUR_ORDER_IDS",
    "MARK_MODES",
    "ISSUE_FILES",
    "PAGE_OPS",
    "BLOCK_CHANGES",
    "PRODUCTION_REFUSALS",
    "isRequestKey",
    "isProductionState",
  ],
  "@manent/ui": ["PRODUCTION_WORDS"],
  "@manent/storage": [],
  "@manent/crdt": [],
  "@manent/server-core": [],
  "@manent/sync-client": [],
  "@manent/sync-client/testing": [],
  "@manent/client-web": [],
  "@manent/formats": [],
  "@manent/editor": [],
  "@manent/testkit": [],
  "@manent/commands": [],
};

const read = (file: string): Promise<string> =>
  Bun.file(join(repoRoot, file)).text();

const exists = async (file: string) => ({
  file,
  exists: await Bun.file(join(repoRoot, file)).exists(),
});

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

const W = PRODUCTION_WORDS;
/** Every value of the production words, each sentence written with sample values; a new key fails the typecheck until it is here. */
const SAID: Readonly<Record<keyof typeof PRODUCTION_WORDS, readonly string[]>> =
  {
    lockTitle: [W.lockTitle],
    lockButton: [W.lockButton],
    lockBody: [W.lockBody("The Long Night", "Blue")],
    lockDefaults: [W.lockDefaults("12A", "White → Blue → Pink …")],
    locked: [W.locked("Blue")],
    change: [W.change],
    numberingChoices: Object.values(W.numberingChoices),
    lockTooltip: [W.lockTooltip("12A")],
    lockMarkerName: [W.lockMarkerName],
    pagesTab: [W.pagesTab],
    omittedMessage: [W.omittedMessage("4")],
    broughtBack: [W.broughtBack("4")],
    bringBackScene: [W.bringBackScene],
    unlockTitle: [W.unlockTitle],
    unlockButton: [W.unlockButton],
    unlockBody: [W.unlockBody("The Long Night")],
    endTitle: [W.endTitle],
    endButton: [W.endButton],
    endBody: [W.endBody("Pink", "The Long Night")],
    changeLayoutTitle: [W.changeLayoutTitle("paper size to A4")],
    changeLayoutButton: [W.changeLayoutButton("paper size to A4")],
    changeLayoutBody: [
      W.changeLayoutBody(14, 2, "Pink"),
      W.changeLayoutBody(1, 0, "Pink"),
      W.changeLayoutBody(0, 1, "Pink"),
    ],
    tintInFile: [W.tintInFile],
    issueTitle: [W.issueTitle("Pink")],
    recallTitle: [W.recallTitle("Blue")],
    lastIssued: [W.lastIssued("BLUE", "Mon 16 Nov")],
    checkNumbersUnchanged: [W.checkNumbersUnchanged],
    checkPagesIntact: [W.checkPagesIntact],
    checkNumbersChanged: [W.checkNumbersChanged("12, 14 and 21")],
    checkPagesChanged: [W.checkPagesChanged("17 and 21A")],
    checkOverflow: [W.checkOverflow("17", "17A")],
    checkFragments: [W.checkFragments("40A", "40C")],
    checkOmitted: [W.checkOmitted(["19"]), W.checkOmitted(["4", "19"])],
    checkEmpty: [W.checkEmpty("12")],
    seePage: [W.seePage],
    consolidate: [W.consolidate],
    changedPages: [
      W.changedPages(14, 9, "17A, 21A, 21B"),
      W.changedPages(3, 1, ""),
    ],
    nothingSince: [W.nothingSince("Blue")],
    fullDraft: [W.fullDraft("Pink")],
    pdfMarked: [W.pdfMarked],
    pdfClean: [W.pdfClean],
    people: [W.people(131), W.people(1)],
    colourLine: [
      W.colourLine("PINK", "White → Blue → Pink → Yellow → Green …"),
    ],
    startsNext: [W.startsNext("Pink", "Yellow")],
    edit: [W.edit],
    packet: [W.packet(14, "Pink")],
    issueButton: [W.issueButton("Pink")],
    issuingButton: [W.issuingButton("Pink")],
    issued: [W.issued("Pink", 131), W.issued("Pink", 1)],
    alreadyIssued: [W.alreadyIssued("Dana", "Blue", "22:41", "Pink")],
    waitingReason: [W.waitingReason(12), W.waitingReason(1)],
    connectionReason: [W.connectionReason],
    recallButton: [W.recallButton("Blue")],
    recallingButton: [W.recallingButton("Blue")],
    corrected: [W.corrected("Blue")],
    sentCorrected: [W.sentCorrected("Blue", 131)],
    recallRow: [
      W.recallRow("Blue", "Priya", "09:14", 2),
      W.recallRow("Blue", "Priya", "09:14", 1),
    ],
    issuedOffline: [W.issuedOffline("Priya", "Blue", "Pink")],
    frozenRow: [W.frozenRow("27 Oct")],
    askToChangeLayout: [W.askToChangeLayout],
    lockingButton: [W.lockingButton],
    unlockingButton: [W.unlockingButton],
    endingButton: [W.endingButton],
    changingLayoutButton: [W.changingLayoutButton("paper size to A4")],
    lockRefused: [W.lockRefused],
    unlockRefused: [W.unlockRefused],
    endRefused: [W.endRefused],
    changeLayoutRefused: [W.changeLayoutRefused("paper size to A4")],
    issueRefused: [W.issueRefused("Pink")],
    recallRefused: [W.recallRefused("Blue")],
    groupTitle: [W.groupTitle],
    revisionRow: [
      W.revisionRow("Blue", "16 Nov 2026", "*", false),
      W.revisionRow("White", "27 Oct 2026", "*", true),
    ],
    revisedDescription: [W.revisedDescription("Blue")],
  };

const productionStrings = (): StringSource[] =>
  Object.values(SAID)
    .flat()
    .map((text) => ({ file: "production", text, scope: "any" }));

test("every production folder entry names only modules that exist, and each list is registered once", async () => {
  for (const [entry, modules] of Object.entries(ENTRIES)) {
    expect({ entry, modules: await namedModules(entry) }).toEqual({
      entry,
      modules: [...modules],
    });
    for (const module of modules)
      expect(await exists(join(dirname(entry), module))).toEqual({
        file: join(dirname(entry), module),
        exists: true,
      });
  }
  for (const file of MODULES)
    expect(await exists(file)).toEqual({ file, exists: true });
  for (const [file, line] of REGISTRATIONS)
    expect({ file, line, times: await timesHeld(file, line) }).toEqual({
      file,
      line,
      times: 1,
    });
});

test("every package entry production revisions reach imports cleanly, with the values they give", async () => {
  for (const [name, values] of Object.entries(ENTRY_VALUES)) {
    const entry: object = await import(name);
    expect({
      name,
      missing: values.filter((value) => !(value in entry)),
    }).toEqual({ name, missing: [] });
  }
});

test("the production sentences, with sample values, pass the glossary check", () => {
  expect(checkStrings(productionStrings())).toEqual([]);
});
