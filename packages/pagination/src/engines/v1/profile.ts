// The page profiles of this engine version: each format's page and its changes to the elements,
// then a project's options and style.

import type { FormatId } from "@manent/schema";
import type {
  ElementSpec,
  FurnitureSettings,
  PageProfile,
  Paper,
  RuleSettings,
  SpecKey,
} from "../../page-profile.ts";
import { CELL_PT, LINE_PT } from "../../units.ts";
import { ELEMENT_ROWS, MANUSCRIPT_ROWS } from "./profile-elements.ts";

type ElementChanges = Readonly<Partial<Record<SpecKey, Partial<ElementSpec>>>>;

export interface ProfileOptions {
  /** Default "letter". */
  readonly paper?: Paper;
  /** Default: the format's; clamped to 10 … the most the paper holds. */
  readonly linesPerPage?: number;
  /** Default 1. */
  readonly sceneHeadingSpaceBefore?: 1 | 2;
  readonly speechContinued?: boolean;
  readonly speakerContinued?: boolean;
  readonly sceneContinued?: boolean;
  readonly scenesNumbered?: boolean;
  /** Read by the multi-camera format only; each default true. */
  readonly multicam?: {
    readonly dialogueDoubleSpaced?: boolean;
    readonly sceneStartingPage?: boolean;
    readonly scenesLettered?: boolean;
  };
  /** A project's style, applied last. */
  readonly elements?: ElementChanges;
}

type FurnitureFlags = Pick<
  FurnitureSettings,
  | "speechContinued"
  | "speakerContinued"
  | "sceneContinued"
  | "scenesNumbered"
  | "scenesLettered"
>;

interface FormatPage {
  readonly columnCells: number;
  readonly marginLeftPt: number;
  readonly marginTopPt: number;
  readonly pageNumberTopPt: number;
  readonly linesPerPage: Readonly<Record<Paper, number>>;
}

interface FormatLayout {
  readonly page: FormatPage;
  changes(options: ProfileOptions): ElementChanges;
  furniture(options: ProfileOptions): FurnitureFlags;
}

/** The engine version this folder is. */
const VERSION = 1;
const MIN_LINES_PER_PAGE = 10;
const PAPER_SIZES: Readonly<
  Record<Paper, { readonly widthPt: number; readonly heightPt: number }>
> = Object.freeze({
  letter: Object.freeze({ widthPt: 612, heightPt: 792 }),
  a4: Object.freeze({ widthPt: 595.28, heightPt: 841.89 }),
});
const RULES: RuleSettings = Object.freeze({
  minLines: 2,
  actionNoSplitBelow: 4,
  dualSplitAbove: 0.5,
});
const DUAL: PageProfile["dual"] = Object.freeze({
  character: Object.freeze({ indent: 8, width: 20 }),
  parenthetical: Object.freeze({ indent: 4, width: 20 }),
  dialogue: Object.freeze({ indent: 0, width: 28 }),
});
/** Cells from the left column's edge to the right column's. */
const DUAL_RIGHT_OFFSET = 32;
const FURNITURE_TEXT = Object.freeze({
  moreText: "(MORE)",
  contdText: " (CONT'D)",
  continuedTopText: "CONTINUED:",
  continuedFootText: "(CONTINUED)",
  breakMark: "#",
});

const SCREEN_PAGE: FormatPage = Object.freeze({
  columnCells: 60,
  marginLeftPt: 108,
  marginTopPt: 72,
  pageNumberTopPt: 36,
  linesPerPage: Object.freeze({ letter: 54, a4: 58 }),
});

const MANUSCRIPT_PAGE: FormatPage = Object.freeze({
  columnCells: 65,
  marginLeftPt: 72,
  marginTopPt: 72,
  pageNumberTopPt: 36,
  linesPerPage: Object.freeze({ letter: 54, a4: 58 }),
});

function scriptFurniture(
  options: ProfileOptions,
  scenesNumbered: boolean,
  scenesLettered: boolean,
): FurnitureFlags {
  return {
    speechContinued: options.speechContinued ?? true,
    speakerContinued: options.speakerContinued ?? true,
    sceneContinued: options.sceneContinued ?? false,
    scenesNumbered: options.scenesNumbered ?? scenesNumbered,
    scenesLettered,
  };
}

const SCREENPLAY = Object.freeze<FormatLayout>({
  page: SCREEN_PAGE,
  changes: () => ({}),
  furniture: (options) => scriptFurniture(options, false, false),
});

const MULTICAM = Object.freeze<FormatLayout>({
  page: SCREEN_PAGE,
  changes: ({ multicam = {} }) => ({
    dialogue: { lineSpacing: (multicam.dialogueDoubleSpaced ?? true) ? 2 : 1 },
    action: { capitalized: true },
    scene_heading: { startingPage: multicam.sceneStartingPage ?? true },
    "act_break.new_act": { startingPage: true },
  }),
  furniture: (options) =>
    scriptFurniture(options, true, options.multicam?.scenesLettered ?? true),
});

const MANUSCRIPT = Object.freeze<FormatLayout>({
  page: MANUSCRIPT_PAGE,
  changes: () => MANUSCRIPT_ROWS,
  // prose has no speeches or scenes to continue or number
  furniture: () => ({
    speechContinued: false,
    speakerContinued: false,
    sceneContinued: false,
    scenesNumbered: false,
    scenesLettered: false,
  }),
});

/** Laid out as a stage direction: indented, and set in parentheses that are furniture, never text. */
const STAGE_DIRECTION: Partial<ElementSpec> = Object.freeze({
  indent: 15,
  width: 45,
  align: "left",
  spaceBefore: 1,
  capitalized: false,
  keptWithNext: false,
  split: "action",
  enclosure: Object.freeze(["(", ")"] as const),
});

const STAGE_PLAY = Object.freeze<FormatLayout>({
  page: SCREEN_PAGE,
  changes: () => ({
    "act_break.new_act": {
      align: "center",
      capitalized: true,
      keptWithNext: true,
      startingPage: true,
    },
    scene_heading: {
      indent: 0,
      width: 60,
      align: "center",
      capitalized: false,
      spaceBefore: 2,
      keptWithNext: true,
      startingPage: false,
    },
    character: {
      indent: 0,
      width: 60,
      align: "center",
      capitalized: true,
      spaceBefore: 1,
      keptWithNext: true,
    },
    dialogue: { indent: 0, width: 60, spaceBefore: 0, split: "dialogue" },
    parenthetical: { indent: 10, width: 40, keptWithNext: true },
    action: STAGE_DIRECTION,
    // a shot or a transition only arrives by a format switch
    shot: STAGE_DIRECTION,
    transition: STAGE_DIRECTION,
  }),
  furniture: (options) => scriptFurniture(options, false, false),
});

const LAYOUTS: Readonly<Record<FormatId, FormatLayout | null>> = Object.freeze({
  screenplay: SCREENPLAY,
  multicam: MULTICAM,
  animation: SCREENPLAY,
  variety: SCREENPLAY,
  game: SCREENPLAY,
  // a list of lines, not pages
  ink: null,
  manuscript: MANUSCRIPT,
  stage_play: STAGE_PLAY,
});

function isFormatId(format: string): format is FormatId {
  return Object.hasOwn(LAYOUTS, format);
}

function isSpecKey(key: string): key is SpecKey {
  return Object.hasOwn(ELEMENT_ROWS, key);
}

/** The row an element is laid out by: an act break by its kind (none is a new act), an unknown type as `general`. */
export function specKey(type: string, kind: string | null): SpecKey {
  if (type === "act_break") {
    const key = `act_break.${kind}`;
    return isSpecKey(key) ? key : "act_break.new_act";
  }
  return isSpecKey(type) ? type : "general";
}

function withChanges(
  changes: readonly ElementChanges[],
): Record<SpecKey, ElementSpec> {
  const rows = { ...ELEMENT_ROWS };
  for (const change of changes) {
    for (const [key, spec] of Object.entries(change)) {
      if (isSpecKey(key)) rows[key] = { ...rows[key], ...spec };
    }
  }
  return rows;
}

function freezeDeep(value: object): void {
  for (const inner of Object.values(value)) {
    if (typeof inner === "object" && inner !== null) freezeDeep(inner);
  }
  Object.freeze(value);
}

/** The profile with its key, the JSON of everything else, deeply frozen. */
export function keyedProfile(profile: Omit<PageProfile, "key">): PageProfile {
  const result: PageProfile = { ...profile, key: JSON.stringify(profile) };
  freezeDeep(result);
  return result;
}

/** The deeply frozen profile of a format: null only for "ink", which has no pages; an unknown format lays out as "screenplay". */
export function profileFor(
  format: string,
  options: ProfileOptions = {},
): PageProfile | null {
  const layout = LAYOUTS[isFormatId(format) ? format : "screenplay"];
  if (layout === null) return null;
  const { page } = layout;
  const paper = options.paper ?? "letter";
  const { widthPt, heightPt } = PAPER_SIZES[paper];
  const most = Math.floor((heightPt - page.marginTopPt) / LINE_PT);
  const linesPerPage = Math.min(
    most,
    Math.max(
      MIN_LINES_PER_PAGE,
      options.linesPerPage ?? page.linesPerPage[paper],
    ),
  );
  const sceneSpace: ElementChanges = {
    scene_heading: {
      spaceBefore:
        options.sceneHeadingSpaceBefore ??
        ELEMENT_ROWS.scene_heading.spaceBefore,
    },
  };
  const profile: Omit<PageProfile, "key"> = {
    engineVersion: VERSION,
    format,
    paper,
    columnCells: page.columnCells,
    linesPerPage,
    geometry: {
      widthPt,
      heightPt,
      marginLeftPt: page.marginLeftPt,
      marginTopPt: page.marginTopPt,
      marginRightPt: widthPt - page.marginLeftPt - page.columnCells * CELL_PT,
      marginBottomPt: heightPt - page.marginTopPt - linesPerPage * LINE_PT,
      pageNumberTopPt: page.pageNumberTopPt,
    },
    elements: withChanges([
      sceneSpace,
      layout.changes(options),
      options.elements ?? {},
    ]),
    dual: DUAL,
    dualRightOffset: DUAL_RIGHT_OFFSET,
    rules: RULES,
    furniture: {
      ...layout.furniture(options),
      castLists: false,
      speechesNumbered: false,
      ...FURNITURE_TEXT,
    },
  };
  return keyedProfile(profile);
}

/** The page's size on screen at 100 %, in pixels: points × 4/3. */
export function pageSizePx(profile: PageProfile): {
  width: number;
  height: number;
} {
  return {
    width: (profile.geometry.widthPt * 4) / 3,
    height: (profile.geometry.heightPt * 4) / 3,
  };
}
