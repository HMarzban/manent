import { expect, test } from "bun:test";
import { COMMANDS, createCommandService } from "@manent/commands";
import type { CommandContext, CommandDefinition } from "@manent/commands";
import {
  SETTINGS,
  createMemoryBag,
  createSettingsStore,
} from "@manent/settings";
import {
  createCommandSource,
  createSettingSource,
  matchesQuery,
  rankRows,
} from "../src/index.ts";
import type { PaletteRow, PaletteSource } from "../src/index.ts";

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
  historyPresent: false,
  format: null,
  rulerShown: false,
  spaceBeforeSet: false,
  production: null,
};

const SCOPE_WORDS = {
  personal: "yours",
  device: "this browser",
  script: "this script",
} as const;

const bag = () => createMemoryBag({ initial: {}, writable: () => true });
const settings = createSettingsStore({
  registry: SETTINGS,
  bags: { personal: bag(), device: bag(), script: bag() },
  beforeWrite: () => {},
  deferRemote: (apply) => apply(),
  locked: () => false,
});
const service = createCommandService({
  commands: COMMANDS,
  handlers: Object.fromEntries(COMMANDS.map((c) => [c.id, () => {}])),
  context: () => CTX,
  settings,
  bindings: () => new Map(),
  onDisabled: () => {},
});
const SOURCES: readonly PaletteSource[] = [
  createCommandSource({
    commands: COMMANDS,
    service,
    platform: "mac",
    shell: "web",
  }),
  createSettingSource({
    commands: COMMANDS,
    service,
    settings,
    platform: "mac",
    shell: "web",
    scopeWords: SCOPE_WORDS,
  }),
];

const placeRow = (n: number): PaletteRow => ({
  id: `place.${n}`,
  kind: "place",
  label: `${n}. ${n % 2 === 0 ? "INT." : "EXT."} LIGHTHOUSE ${n % 7 === 0 ? "INTERIOR" : "STAIRS"} - NIGHT`,
  value: null,
  scopeWord: null,
  home: null,
  keys: null,
  enabled: true,
  whyNot: null,
});

const THREE_THOUSAND_SCENES: readonly PaletteRow[] = Array.from(
  { length: 3000 },
  (_, i) => placeRow(i + 1),
);

const placesSource = (rows: readonly PaletteRow[]): PaletteSource => ({
  kind: "place",
  rows: (query) => rows.filter((row) => matchesQuery(query, [row.label])),
});

function search(
  query: string,
  options: { places?: readonly PaletteRow[] } = {},
): readonly PaletteRow[] {
  const sources =
    options.places === undefined
      ? SOURCES
      : [...SOURCES, placesSource(options.places)];
  return rankRows(
    query,
    sources.flatMap((source) => source.rows(query)),
  );
}

const visibleInPalette = (c: CommandDefinition): boolean =>
  !("hidden" in c.palette) && service.state(c.id).visible;

const row = (
  id: string,
  label: string,
  kind: PaletteRow["kind"] = "command",
): PaletteRow => ({
  id,
  kind,
  label,
  value: null,
  scopeWord: null,
  home: null,
  keys: null,
  enabled: true,
  whyNot: null,
});

test("rows are ranked stably, sources in their fixed order", () => {
  const rows = [
    row("a", "Side panel"),
    row("b", "Paper: A4", "setting"),
    row("c", "Panels and pages"),
    row("d", "Page view", "setting"),
    row("e", "Pa", "place"),
  ];
  expect(rankRows("pa", rows).map((r) => r.id)).toEqual([
    "b",
    "c",
    "d",
    "e",
    "a",
  ]);
  expect(rankRows("", rows).map((r) => r.id)).toEqual([
    "a",
    "b",
    "c",
    "d",
    "e",
  ]);
});

test("a query matches each of its words at the start of a word, in any case", () => {
  const cases: readonly (readonly [string, readonly string[]])[] = [
    ["left pan", ["Left panel"]],
    ["PAN LEFT", ["Left panel"]],
    ["eft", ["Left panel"]],
    ["night mode", ["Theme: Dark", "night mode"]],
    ["scrolling: turn", ["Typewriter scrolling: turn on"]],
    ["", ["anything"]],
  ];
  expect(cases.map(([query, texts]) => matchesQuery(query, texts))).toEqual([
    true,
    true,
    false,
    true,
    true,
    true,
  ]);
});

test("a query finds every command and every preference by label and synonym", () => {
  for (const c of COMMANDS.filter(visibleInPalette)) {
    const label = service.state(c.id).label;
    expect([
      c.id,
      search(label)
        .map((r) => r.id)
        .includes(c.id),
    ]).toEqual([c.id, true]);
  }
  expect(search("night mode").map((r) => r.label)).toEqual(
    expect.arrayContaining(["Theme: Dark"]),
  );
  expect(search("settings").map((r) => r.id)).toContain("app.preferences");
});

test("a setting row carries its value, its scope and where it lives", () => {
  const rows = search("same-speaker").filter((r) => r.kind === "setting");
  expect(rows).toEqual([
    {
      id: "setting.script.sameSpeakerContd",
      kind: "setting",
      label: "Same-speaker (CONT'D)",
      value: "On",
      scopeWord: "this script",
      home: "Details → Script",
      keys: null,
      enabled: true,
      whyNot: null,
    },
  ]);
  expect(
    search("theme dark").find((r) => r.id === "setting.appearance.theme.dark"),
  ).toMatchObject({
    label: "Theme: Dark",
    value: null,
    scopeWord: "yours",
    home: "Preferences → Appearance",
  });
});

test("a command hidden from the palette or absent here is not listed", () => {
  const ids = search("").map((r) => r.id);
  expect([
    ids.includes("settings.undo"),
    ids.includes("demo.tour"),
    ids.includes("app.library"),
  ]).toEqual([false, false, true]);
});

test("3,000 places are filtered within 50 ms", () => {
  search("int", { places: THREE_THOUSAND_SCENES });
  const t0 = performance.now();
  const found = search("int", { places: THREE_THOUSAND_SCENES });
  expect(performance.now() - t0).toBeLessThan(50);
  expect(found.filter((r) => r.kind === "place").length).toBe(1714);
});
