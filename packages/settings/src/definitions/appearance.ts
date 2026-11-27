// The Appearance preferences: scheme, studio palette, white page, hidden gems and personal format/project matching.
import { setting } from "../define.ts";
import { t } from "../types.ts";

export const STUDIO_PALETTE_CHOICES = Object.freeze([
  { value: "studio", label: "Studio" },
  { value: "hyperdrive", label: "Twin suns" },
  { value: "starfleet", label: "Starlog" },
  { value: "celluloid", label: "Celluloid" },
  { value: "nightwire", label: "Electric sheep" },
  { value: "viridian", label: "Cold harbour" },
  { value: "marquee", label: "Fifty-third" },
  { value: "newsdesk", label: "Dateline" },
  { value: "breakingdesk", label: "Breaking desk" },
  { value: "broadsheet", label: "Broadsheet" },
  { value: "telegraph", label: "Telegraph" },
  { value: "sylvan", label: "West march" },
  { value: "clothbound", label: "Clothbound" },
  { value: "ambercourt", label: "Amber court" },
  { value: "seaandink", label: "Sea and ink" },
  { value: "copperplate", label: "Copperplate" },
  { value: "proscenium", label: "Ghost light" },
  { value: "globetimber", label: "Globe timber" },
  { value: "velvetbox", label: "Velvet box" },
  { value: "soundbooth", label: "Green room" },
  { value: "reeltoreel", label: "Reel to reel" },
  { value: "nightfreq", label: "Night frequency" },
  { value: "chiaroscuro", label: "Gilded die" },
  { value: "nocturne", label: "Crossroads" },
] as const);

export type StudioPaletteId = (typeof STUDIO_PALETTE_CHOICES)[number]["value"];

export const STUDIO_PALETTE_IDS: readonly StudioPaletteId[] = Object.freeze(
  STUDIO_PALETTE_CHOICES.map((c) => c.value),
);

const PALETTE_ATTR_VALUES: Readonly<Record<StudioPaletteId, string | null>> =
  Object.freeze(
    Object.fromEntries(
      STUDIO_PALETTE_IDS.map((id) => [id, id === "studio" ? null : id]),
    ) as Record<StudioPaletteId, string | null>,
  );

export const FORMAT_PALETTE_KEYS = Object.freeze([
  "screenplay",
  "multicam",
  "stage",
  "manuscript",
  "animation",
  "variety",
  "game",
  "ink",
  "show",
  "news",
] as const);

export type FormatPaletteKey = (typeof FORMAT_PALETTE_KEYS)[number];

export const DEFAULT_FORMAT_PALETTES: Readonly<
  Record<FormatPaletteKey, StudioPaletteId>
> = Object.freeze({
  screenplay: "hyperdrive",
  multicam: "viridian",
  stage: "proscenium",
  manuscript: "sylvan",
  animation: "celluloid",
  variety: "marquee",
  game: "chiaroscuro",
  ink: "nocturne",
  show: "marquee",
  news: "newsdesk",
});

export const APPEARANCE_SETTINGS = Object.freeze([
  setting({
    key: "appearance.theme",
    scope: "personal",
    type: t.choice([
      { value: "system", label: "System" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ]),
    default: "system" as const,
    label: "Theme",
    description: null,
    noun: null,
    surfaces: [
      { in: "preferences", section: "appearance", order: 10 },
      { in: "menu", menu: "view", group: "theme", order: 10, under: null },
      { in: "palette" },
    ],
    apply: {
      how: "attribute",
      name: "data-theme",
      values: { system: null, light: "light", dark: "dark" },
    },
    boot: true,
    guard: null,
    keywords: ["night mode"],
  }),
  setting({
    key: "appearance.palette",
    scope: "personal",
    type: t.choice(STUDIO_PALETTE_CHOICES),
    default: "studio" as const,
    label: "App theme",
    description:
      "Calibrated for long sessions: low-glare surfaces and steady contrast.",
    noun: "app theme",
    surfaces: [
      { in: "preferences", section: "appearance", order: 15 },
      { in: "palette" },
    ],
    apply: {
      how: "attribute",
      name: "data-palette",
      values: PALETTE_ATTR_VALUES,
    },
    boot: true,
    guard: null,
    keywords: [
      "palette",
      "colour",
      "studio",
      "film",
      "news",
      "books",
      "stage",
      "podcast",
      "games",
    ],
  }),
  setting({
    key: "appearance.whitePage",
    scope: "personal",
    type: t.boolean(),
    default: false,
    label: "White page in dark theme",
    description: null,
    noun: null,
    surfaces: [
      { in: "preferences", section: "appearance", order: 20 },
      {
        in: "menu",
        menu: "view",
        group: "theme",
        order: 20,
        under: "appearance.theme",
      },
      { in: "palette" },
    ],
    apply: {
      how: "attribute",
      name: "data-white-page",
      values: { true: "", false: null },
    },
    boot: true,
    guard: null,
    keywords: [],
  }),
  setting({
    key: "appearance.gems",
    scope: "personal",
    type: t.boolean(),
    default: true,
    label: "Theme hidden gems",
    description: "Subtle collector emblems and quiet genre whispers.",
    noun: null,
    surfaces: [
      { in: "preferences", section: "appearance", order: 25 },
      { in: "palette" },
    ],
    apply: {
      how: "attribute",
      name: "data-gems",
      values: { true: null, false: "off" },
    },
    boot: true,
    guard: null,
    keywords: ["emblems", "icons", "whispers"],
  }),
  setting({
    key: "appearance.autoByFormat",
    scope: "personal",
    type: t.boolean(),
    default: false,
    label: "Match each project's format",
    description:
      "Switch themes automatically to suit the kind of script you open.",
    noun: null,
    surfaces: [
      { in: "preferences", section: "appearance", order: 30 },
      { in: "palette" },
    ],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: ["format", "automatic", "project"],
  }),
  setting({
    key: "appearance.formatPalettes",
    scope: "personal",
    type: t.fields(FORMAT_PALETTE_KEYS),
    default: DEFAULT_FORMAT_PALETTES,
    label: "Theme for each format",
    description: null,
    noun: null,
    surfaces: [{ in: "preferences", section: "appearance", order: 35 }],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: ["format", "palette"],
  }),
  setting({
    key: "appearance.projectPalettes",
    scope: "personal",
    type: t.text({ maxLength: 8192 }),
    default: "",
    label: "Personal project themes",
    description: null,
    noun: null,
    surfaces: [{ in: "preferences", section: "appearance", order: 40 }],
    apply: { how: "read" },
    boot: false,
    guard: null,
    keywords: ["override", "project"],
  }),
] as const);
