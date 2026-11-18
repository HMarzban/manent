import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  POINTERS,
  PREFERENCE_LIST,
  RETIRED_KEYS,
  SETTINGS,
  createMemoryBag,
  createRegistry,
  createSettingsStore,
  paperForRegion,
  setting,
  t,
} from "../src/index.ts";
import type { SettingKey, SettingValue, SettingsStore } from "../src/index.ts";

const LETTER_REGIONS = [
  "US",
  "CA",
  "MX",
  "PH",
  "CL",
  "CO",
  "VE",
  "GT",
  "CR",
  "PA",
  "DO",
  "PR",
];

const emptyBag = () => createMemoryBag({ initial: {}, writable: () => true });

const throwaway = setting({
  key: "writing.extra",
  scope: "personal",
  type: t.boolean(),
  default: false,
  label: "Extra",
  description: null,
  noun: null,
  surfaces: [
    { in: "preferences", section: "writing", order: 60 },
    { in: "palette" },
  ],
  apply: { how: "read" },
  boot: false,
  guard: null,
  keywords: [],
});

test("the list of preferences is closed at nine", () => {
  expect(PREFERENCE_LIST).toEqual([
    "writing.enterAfterDialogue",
    "writing.typewriterScrolling",
    "writing.checkSpelling",
    "writing.showCursors",
    "writing.announce",
    "appearance.theme",
    "appearance.whitePage",
    "keyboard.shortcuts",
    "device.interfaceSize",
  ]);
  expect(
    [...SETTINGS.byScope("personal"), ...SETTINGS.byScope("device")]
      .map((d) => d.key)
      .toSorted(),
  ).toEqual(
    PREFERENCE_LIST.filter((k) => k !== "keyboard.shortcuts").toSorted(),
  );
});

test("each setting keeps its label, its default and whether it applies before the first paint", () => {
  expect(SETTINGS.all.map((d) => [d.key, d.label, d.default, d.boot])).toEqual([
    [
      "writing.enterAfterDialogue",
      "After Dialogue, Enter starts",
      "action",
      false,
    ],
    ["writing.typewriterScrolling", "Typewriter scrolling", false, false],
    ["writing.checkSpelling", "Check spelling as I type", true, false],
    ["writing.showCursors", "Show other people's cursors", true, false],
    ["writing.announce", "Announce while writing", "elements_pages", false],
    ["appearance.theme", "Theme", "system", true],
    ["appearance.whitePage", "White page in dark theme", false, true],
    ["device.interfaceSize", "Interface size", "100", true],
    ["script.format", "Format", "screenplay", false],
    ["script.paper", "Paper", "letter", false],
    ["script.moresAtBreaks", "(MORE) and (CONT'D) at page breaks", true, false],
    ["script.sameSpeakerContd", "Same-speaker (CONT'D)", true, false],
    ["script.sceneContinued", "Scene CONTINUED", false, false],
  ]);
  expect(SETTINGS.get("writing.announce").type.choices).toEqual([
    { value: "elements", label: "Element changes" },
    { value: "elements_pages", label: "Element changes and page starts" },
    {
      value: "elements_pages_people",
      label: "Element changes, page starts and people arriving or leaving",
    },
  ]);
  expect(SETTINGS.get("device.interfaceSize").apply).toEqual({
    how: "attribute",
    name: "data-ui-size",
    values: { "100": null, "125": "125", "150": "150", "200": "200" },
  });
  expect(SETTINGS.get("writing.checkSpelling").description).toBe(
    "Underlines misspellings and names that nearly match your project's names. Checks still lists everything before you send.",
  );
});

test("each setting's help, values, places and effect are fixed", () => {
  const palette = { in: "palette" } as const;
  expect(
    SETTINGS.all.map((d) => ({
      key: d.key,
      scope: d.scope,
      choices: d.type.choices,
      description: d.description,
      noun: d.noun,
      surfaces: d.surfaces,
      apply: d.apply,
      guard: d.guard,
      keywords: d.keywords,
    })),
  ).toEqual([
    {
      key: "writing.enterAfterDialogue",
      scope: "personal",
      choices: [
        { value: "action", label: "Action" },
        { value: "character", label: "Character" },
      ],
      description: null,
      noun: null,
      surfaces: [{ in: "preferences", section: "writing", order: 10 }, palette],
      apply: { how: "editor", effect: "behaviour" },
      guard: null,
      keywords: [],
    },
    {
      key: "writing.typewriterScrolling",
      scope: "personal",
      choices: null,
      description:
        "Keeps the line you are writing at the same height in the window.",
      noun: null,
      surfaces: [
        { in: "preferences", section: "writing", order: 20 },
        { in: "menu", menu: "view", group: "writing", order: 10 },
        palette,
      ],
      apply: { how: "editor", effect: "behaviour" },
      guard: null,
      keywords: [],
    },
    {
      key: "writing.checkSpelling",
      scope: "personal",
      choices: null,
      description:
        "Underlines misspellings and names that nearly match your project's names. Checks still lists everything before you send.",
      noun: null,
      surfaces: [
        { in: "preferences", section: "writing", order: 30 },
        { in: "menu", menu: "edit", group: "spelling", order: 10 },
        palette,
      ],
      apply: { how: "editor", effect: "decorations" },
      guard: null,
      keywords: [],
    },
    {
      key: "writing.showCursors",
      scope: "personal",
      choices: null,
      description:
        "Hides their cursors and name tabs when off. Margin avatars stay, and other people still see yours.",
      noun: null,
      surfaces: [
        { in: "preferences", section: "writing", order: 40 },
        { in: "menu", menu: "view", group: "people", order: 10 },
        palette,
      ],
      apply: {
        how: "attribute",
        name: "data-cursors",
        values: { true: null, false: "off" },
      },
      guard: null,
      keywords: [],
    },
    {
      key: "writing.announce",
      scope: "personal",
      choices: [
        { value: "elements", label: "Element changes" },
        { value: "elements_pages", label: "Element changes and page starts" },
        {
          value: "elements_pages_people",
          label: "Element changes, page starts and people arriving or leaving",
        },
      ],
      description:
        "For screen readers. 'Where am I?' reads everything on request, whatever you choose here.",
      noun: null,
      surfaces: [{ in: "preferences", section: "writing", order: 50 }, palette],
      apply: { how: "read" },
      guard: null,
      keywords: [],
    },
    {
      key: "appearance.theme",
      scope: "personal",
      choices: [
        { value: "system", label: "System" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ],
      description: null,
      noun: null,
      surfaces: [
        { in: "preferences", section: "appearance", order: 10 },
        { in: "menu", menu: "view", group: "theme", order: 10 },
        palette,
      ],
      apply: {
        how: "attribute",
        name: "data-theme",
        values: { system: null, light: "light", dark: "dark" },
      },
      guard: null,
      keywords: ["night mode"],
    },
    {
      key: "appearance.whitePage",
      scope: "personal",
      choices: null,
      description: null,
      noun: null,
      surfaces: [
        { in: "preferences", section: "appearance", order: 20 },
        { in: "menu", menu: "view", group: "theme", order: 20 },
        palette,
      ],
      apply: {
        how: "attribute",
        name: "data-white-page",
        values: { true: "", false: null },
      },
      guard: null,
      keywords: [],
    },
    {
      key: "device.interfaceSize",
      scope: "device",
      choices: [
        { value: "100", label: "100 %" },
        { value: "125", label: "125 %" },
        { value: "150", label: "150 %" },
        { value: "200", label: "200 %" },
      ],
      description:
        "Text and controls around the page. The page has its own zoom, in View ▾.",
      noun: null,
      surfaces: [
        { in: "preferences", section: "device", order: 10 },
        { in: "menu", menu: "view", group: "size", order: 10 },
        palette,
      ],
      apply: {
        how: "attribute",
        name: "data-ui-size",
        values: { "100": null, "125": "125", "150": "150", "200": "200" },
      },
      guard: null,
      keywords: [],
    },
    {
      key: "script.format",
      scope: "script",
      choices: [
        { value: "screenplay", label: "Screenplay" },
        { value: "multicam", label: "Multi-camera" },
        { value: "animation", label: "Animation" },
        { value: "variety", label: "Variety" },
        { value: "game", label: "Game Script" },
        { value: "ink", label: "Ink" },
        { value: "manuscript", label: "Manuscript" },
        { value: "stage_play", label: "Stage play" },
      ],
      description: null,
      noun: "format",
      surfaces: [
        { in: "scriptSettings", group: "page_setup", order: 10 },
        palette,
      ],
      apply: { how: "editor", effect: "layout" },
      guard: "layout",
      keywords: [],
    },
    {
      key: "script.paper",
      scope: "script",
      choices: [
        { value: "letter", label: "US Letter" },
        { value: "a4", label: "A4" },
      ],
      description: null,
      noun: "paper size",
      surfaces: [
        { in: "scriptSettings", group: "page_setup", order: 20 },
        palette,
      ],
      apply: { how: "editor", effect: "layout" },
      guard: "layout",
      keywords: [],
    },
    {
      key: "script.moresAtBreaks",
      scope: "script",
      choices: null,
      description: null,
      noun: "(MORE) and (CONT'D) at page breaks",
      surfaces: [{ in: "scriptSettings", group: "mores", order: 10 }, palette],
      apply: { how: "editor", effect: "layout" },
      guard: "layout",
      keywords: [],
    },
    {
      key: "script.sameSpeakerContd",
      scope: "script",
      choices: null,
      description: null,
      noun: "same-speaker (CONT'D)",
      surfaces: [{ in: "scriptSettings", group: "mores", order: 20 }, palette],
      apply: { how: "editor", effect: "layout" },
      guard: "layout",
      keywords: [],
    },
    {
      key: "script.sceneContinued",
      scope: "script",
      choices: null,
      description: null,
      noun: "scene CONTINUED",
      surfaces: [{ in: "scriptSettings", group: "mores", order: 30 }, palette],
      apply: { how: "editor", effect: "layout" },
      guard: "layout",
      keywords: [],
    },
  ]);
  expect(RETIRED_KEYS).toEqual([]);
});

test("only appearance writes attributes, and they are the four the root element takes", () => {
  expect(
    SETTINGS.all
      .filter((d) => d.apply.how === "attribute")
      .map((d) => (d.apply as { name: string }).name)
      .toSorted(),
  ).toEqual(["data-cursors", "data-theme", "data-ui-size", "data-white-page"]);
});

test("no preference reaches the layout, and every script setting is guarded", () => {
  for (const d of SETTINGS.byScope("personal"))
    expect(d.apply).not.toEqual({ how: "editor", effect: "layout" });
  for (const d of SETTINGS.byScope("script"))
    expect([d.guard, d.apply]).toEqual([
      "layout",
      { how: "editor", effect: "layout" },
    ]);
});

test("a search never ends in nothing: one signpost and an answer for each default", () => {
  expect(POINTERS.map((p) => [p.label, p.kind])).toEqual([
    ["Paper size", "elsewhere"],
    ["Auto-save", "answer"],
    ["Backup", "answer"],
    ["Font", "answer"],
    ["Auto-capitalise", "answer"],
    ["Smart quotes", "answer"],
    ["Autocomplete", "answer"],
    ["Reduce motion", "answer"],
    ["Contrast", "answer"],
    ["Language", "answer"],
    ["Date format", "answer"],
    ["Updates", "answer"],
    ["Usage data", "answer"],
    ["Notifications", "answer"],
  ]);
  expect(POINTERS[1]!.says).toBe(
    "Nothing to set. Manent saves every keystroke on this device before it is sent. The status beside the title says where your work is.",
  );
  expect(POINTERS[11]!.says).toEqual({
    desktop:
      "Nothing to set. Manent updates itself the next time it starts; This device shows which Manent you have and its channel.",
    web: "Nothing to set. Manent updates once every Manent tab has been closed.",
  });
  expect(POINTERS.map((p) => [p.keywords, p.says, p.opens])).toEqual([
    [
      ["paper", "a4", "letter"],
      "Script settings — shared with everyone on the script",
      "doc.scriptSettings",
    ],
    [
      ["autosave", "auto-save", "save"],
      "Nothing to set. Manent saves every keystroke on this device before it is sent. The status beside the title says where your work is.",
      null,
    ],
    [
      ["backup", "back up"],
      "Nothing to set. Every keystroke is saved on this device, and a synced script is also on the server. The status beside the title says where your work is.",
      null,
    ],
    [
      ["font", "typeface", "courier"],
      "Nothing to set. Scripts are always set in Courier Prime, so the pages print as they look. Interface size changes the text around the page.",
      null,
    ],
    [
      [
        "auto-capitalise",
        "autocapitalise",
        "capitalise",
        "capitalize",
        "capitals",
      ],
      "Nothing to set. Manent keeps the letters you type; a format shows an element in capitals where the industry does.",
      null,
    ],
    [
      ["smart quotes", "quotes", "apostrophes"],
      "Nothing to set. Quotes and apostrophes are kept as you type them, so files you import and export match.",
      null,
    ],
    [
      ["autocomplete", "auto-complete", "suggestions"],
      "Nothing to set. Names, scene headings and transitions are offered from your script as you type; Esc closes the list.",
      null,
    ],
    [
      ["reduce motion", "motion", "animation"],
      "Nothing to set. Manent follows your system: turn on reduced motion there.",
      null,
    ],
    [
      ["contrast", "high contrast"],
      "Nothing to set. Manent follows your system: turn on more contrast there.",
      null,
    ],
    [
      ["language", "spelling language"],
      "Nothing to set. Manent is in English in this release; spelling follows your system's language.",
      null,
    ],
    [
      ["date format", "dates"],
      "Dates in a script follow its project's date format, in Project settings → Format and style.",
      null,
    ],
    [
      ["updates", "update", "version"],
      {
        desktop:
          "Nothing to set. Manent updates itself the next time it starts; This device shows which Manent you have and its channel.",
        web: "Nothing to set. Manent updates once every Manent tab has been closed.",
      },
      null,
    ],
    [
      ["usage data", "telemetry", "analytics", "tracking"],
      "Nothing to set. Manent sends no usage data.",
      null,
    ],
    [
      ["notifications", "email", "mentions"],
      "Nothing to set here. A workspace's owners choose where comments and mentions go, in Workspace settings → Notifications.",
      null,
    ],
  ]);
});

test("script settings carry the nouns their messages use", () => {
  expect(SETTINGS.byScope("script").map((d) => [d.key, d.noun])).toEqual([
    ["script.format", "format"],
    ["script.paper", "paper size"],
    ["script.moresAtBreaks", "(MORE) and (CONT'D) at page breaks"],
    ["script.sameSpeakerContd", "same-speaker (CONT'D)"],
    ["script.sceneContinued", "scene CONTINUED"],
  ]);
});

test("a new script's paper follows the region of the language", () => {
  expect(
    ["en-US", "fr-CA", "es-MX", "en-GB", "de", "pt-BR"].map(paperForRegion),
  ).toEqual(["letter", "letter", "letter", "a4", "a4", "a4"]);
  expect(
    [
      "en-us",
      "en-Latn-US",
      "zh-Hant-TW",
      "es-419",
      "en-u-ca-gregory",
      "en-US-x-ca",
      "",
      "US",
    ].map(paperForRegion),
  ).toEqual(["letter", "letter", "a4", "a4", "a4", "letter", "a4", "a4"]);
});

test("any language tag gives one of the two papers, letter exactly for the letter regions", () => {
  const region = fc.oneof(
    fc.constantFrom(...LETTER_REGIONS),
    fc.constantFrom("GB", "DE", "BR", "FR", "JP", "419"),
  );
  fc.assert(
    fc.property(
      fc.constantFrom("en", "es", "fr", "pt", "zh-Hant", "sr-Latn"),
      region,
      fc.constantFrom("", "-x-private", "-u-ca-gregory"),
      (language, place, extension) => {
        expect(paperForRegion(`${language}-${place}${extension}`)).toBe(
          LETTER_REGIONS.includes(place) ? "letter" : "a4",
        );
      },
    ),
    { numRuns: 300 },
  );
  fc.assert(
    fc.property(fc.string(), (tag) => {
      expect(["letter", "a4"]).toContain(paperForRegion(tag));
    }),
    { numRuns: 300 },
  );
});

test("a preference added with one definition is found everywhere it should be", () => {
  const extra = createRegistry(
    [...SETTINGS.all, throwaway],
    RETIRED_KEYS,
    POINTERS,
  );
  expect([
    extra.bySurface("preferences").some((d) => d.key === "writing.extra"),
    extra.bySurface("palette").some((d) => d.key === "writing.extra"),
  ]).toEqual([true, true]);
});

test("a store over every setting answers each key with its own value type", () => {
  const store: SettingsStore = createSettingsStore({
    registry: SETTINGS,
    bags: { personal: emptyBag(), device: emptyBag(), script: emptyBag() },
    beforeWrite: () => {},
    deferRemote: (apply) => apply(),
    locked: () => false,
  });
  const keys: readonly SettingKey[] = SETTINGS.all.map((d) => d.key);
  expect(keys.map((key) => store.get(key))).toEqual(
    SETTINGS.all.map((d) => d.default),
  );
  const theme: SettingValue<"appearance.theme"> = store.get("appearance.theme");
  const size: SettingValue<"device.interfaceSize"> = store.get(
    "device.interfaceSize",
  );
  expect([
    theme,
    size,
    store.set("script.paper", "a4"),
    store.get("script.paper"),
  ]).toEqual(["system", "100", { ok: true }, "a4"]);
});
