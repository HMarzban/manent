// Layout Engine 3 profiles: Book Publishing typography (Source Serif 4, 10.5pt/15pt), paperback trim sizes and mirrored margins.
import type {
  BookTypography,
  ElementSpec,
  PageProfile,
  Paper,
  SpecKey,
} from "../../page-profile.ts";
import { ELEMENT_ROWS } from "../v1/profile-elements.ts";
import { keyedProfile, specKey } from "../v1/profile.ts";
import type { ProfileOptions } from "../v1/profile.ts";
import { profileFor as profileForV2 } from "../v2/profile.ts";

const VERSION = 3;
const MIN_LINES_PER_PAGE = 10;

export const BOOK_SERIF_TYPOGRAPHY: BookTypography = Object.freeze({
  kind: "book_serif",
  family: "Source Serif 4",
  fontSizePt: 10.5,
  linePt: 15,
  unitPt: 7.5,
  cellPt: 6,
});

interface TrimMetrics {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly marginInnerPt: number;
  readonly marginOuterPt: number;
  readonly marginTopPt: number;
  readonly pageNumberTopPt: number;
  readonly defaultLines: number;
  readonly maxLines: number;
}

const TRIM_METRICS: Readonly<Record<Paper, TrimMetrics>> = Object.freeze({
  trade_5x8: Object.freeze({
    widthPt: 360,
    heightPt: 576,
    marginInnerPt: 54,
    marginOuterPt: 40.5,
    marginTopPt: 54,
    pageNumberTopPt: 27,
    defaultLines: 31,
    maxLines: 34,
  }),
  trade_5_5x8_5: Object.freeze({
    widthPt: 396,
    heightPt: 612,
    marginInnerPt: 58.5,
    marginOuterPt: 45,
    marginTopPt: 58.5,
    pageNumberTopPt: 27,
    defaultLines: 33,
    maxLines: 36,
  }),
  trade_6x9: Object.freeze({
    widthPt: 432,
    heightPt: 648,
    marginInnerPt: 63,
    marginOuterPt: 49.5,
    marginTopPt: 63,
    pageNumberTopPt: 31.5,
    defaultLines: 35,
    maxLines: 38,
  }),
  letter: Object.freeze({
    widthPt: 612,
    heightPt: 792,
    marginInnerPt: 90,
    marginOuterPt: 72,
    marginTopPt: 72,
    pageNumberTopPt: 36,
    defaultLines: 43,
    maxLines: 48,
  }),
  a4: Object.freeze({
    widthPt: 595.28,
    heightPt: 841.89,
    marginInnerPt: 85.5,
    marginOuterPt: 67.5,
    marginTopPt: 72,
    pageNumberTopPt: 36,
    defaultLines: 46,
    maxLines: 51,
  }),
});

const DUAL: PageProfile["dual"] = Object.freeze({
  character: Object.freeze({ indent: 8, width: 20 }),
  parenthetical: Object.freeze({ indent: 4, width: 20 }),
  dialogue: Object.freeze({ indent: 0, width: 28 }),
});

const RULES = Object.freeze({
  minLines: 2,
  actionNoSplitBelow: 4,
  dualSplitAbove: 0.5,
});

function like(base: ElementSpec, changes: Partial<ElementSpec>): ElementSpec {
  return Object.freeze({ ...base, ...changes });
}

function isV1Paper(paper: Paper | undefined): paper is "letter" | "a4" {
  return paper === "letter" || paper === "a4";
}

/** Default lines per page for Engine 3 manuscript on `paper`. */
export function v3DefaultLinesPerPage(paper: Paper): number {
  return TRIM_METRICS[paper].defaultLines;
}

/** Maximum lines per page for Engine 3 manuscript on `paper`. */
export function v3MaxLinesPerPage(paper: Paper): number {
  return TRIM_METRICS[paper].maxLines;
}

/**
 * Layout Engine 3 page profile: for `"manuscript"`, builds a Book Publishing profile with Source Serif 4
 * (`10.5 pt / 15 pt`), paperback trim sizes and mirrored recto/verso margins; other formats delegate to Engine 2.
 */
export function profileFor(
  format: string,
  options: ProfileOptions = {},
): PageProfile | null {
  if (format !== "manuscript") {
    const safePaper = isV1Paper(options.paper) ? options.paper : "letter";
    const base = profileForV2(format, { ...options, paper: safePaper });
    if (base === null) return null;
    const { key: _, ...rest } = base;
    return keyedProfile({ ...rest, engineVersion: VERSION });
  }

  const paper: Paper =
    options.paper !== undefined && Object.hasOwn(TRIM_METRICS, options.paper)
      ? options.paper
      : "letter";
  const trim = TRIM_METRICS[paper];
  const mirrored = options.mirrorMargins ?? true;
  const marginLeftPt = mirrored
    ? trim.marginInnerPt
    : (trim.marginInnerPt + trim.marginOuterPt) / 2;
  const marginRightPt = mirrored
    ? trim.marginOuterPt
    : (trim.marginInnerPt + trim.marginOuterPt) / 2;
  const textWidthPt = trim.widthPt - trim.marginInnerPt - trim.marginOuterPt;
  const columnCells = Math.max(
    24,
    Math.floor(textWidthPt / BOOK_SERIF_TYPOGRAPHY.cellPt),
  );
  const requested =
    options.linesPerPage !== undefined && Number.isFinite(options.linesPerPage)
      ? Math.floor(options.linesPerPage)
      : trim.defaultLines;
  const linesPerPage = Math.min(
    trim.maxLines,
    Math.max(MIN_LINES_PER_PAGE, requested),
  );
  const marginBottomPt = Math.max(
    BOOK_SERIF_TYPOGRAPHY.linePt,
    trim.heightPt -
      trim.marginTopPt -
      linesPerPage * BOOK_SERIF_TYPOGRAPHY.linePt,
  );
  const lineSpacing: 1 | 2 = options.manuscriptLineSpacing === 2 ? 2 : 1;

  const baseAction = ELEMENT_ROWS.action;
  const quoteIndent = Math.min(4, Math.floor(columnCells / 10));
  const epigraphIndent = Math.min(8, Math.floor(columnCells / 5));

  const bookChanges: Partial<Record<SpecKey, Partial<ElementSpec>>> = {
    chapter: {
      indent: 0,
      width: columnCells,
      align: "center",
      spaceBefore: 0,
      dropLines: 6,
      lineSpacing,
      keptWithNext: true,
      startingPage: true,
      split: "never",
    },
    subheading: {
      indent: 0,
      width: columnCells,
      align: "left",
      spaceBefore: 1,
      lineSpacing,
      keptWithNext: true,
      split: "never",
    },
    epigraph: {
      indent: epigraphIndent,
      width: Math.max(20, columnCells - epigraphIndent),
      align: "right",
      spaceBefore: 1,
      lineSpacing,
    },
    body: {
      indent: 0,
      width: columnCells,
      firstLineIndent: 3,
      align: "left",
      spaceBefore: 0,
      lineSpacing,
    },
    quote: {
      indent: quoteIndent,
      width: Math.max(20, columnCells - quoteIndent * 2),
      firstLineIndent: 0,
      align: "left",
      spaceBefore: 1,
      lineSpacing,
    },
    break: {
      indent: 0,
      width: columnCells,
      align: "center",
      spaceBefore: 1,
      lineSpacing,
      keptWithNext: true,
    },
  };

  const elements = {} as Record<SpecKey, ElementSpec>;
  for (const key of Object.keys(ELEMENT_ROWS) as SpecKey[]) {
    const row = ELEMENT_ROWS[key];
    const override = bookChanges[key];
    const custom = options.elements?.[key];
    const merged =
      override === undefined && custom === undefined
        ? row
        : like(row, { ...override, ...custom });
    const clampedWidth = Math.min(
      Math.max(1, merged.width),
      Math.max(1, columnCells - Math.min(merged.indent, columnCells - 1)),
    );
    elements[key] =
      clampedWidth === merged.width
        ? merged
        : like(merged, { width: clampedWidth });
  }

  // Re-clamp element specs referencing baseAction
  void baseAction;
  void specKey;

  return keyedProfile({
    engineVersion: VERSION,
    format: "manuscript",
    paper,
    columnCells,
    linesPerPage,
    geometry: Object.freeze({
      widthPt: trim.widthPt,
      heightPt: trim.heightPt,
      marginLeftPt,
      marginTopPt: trim.marginTopPt,
      marginRightPt,
      marginBottomPt,
      pageNumberTopPt: trim.pageNumberTopPt,
      mirrored,
      marginInnerPt: trim.marginInnerPt,
      marginOuterPt: trim.marginOuterPt,
      linePt: BOOK_SERIF_TYPOGRAPHY.linePt,
      unitPt: BOOK_SERIF_TYPOGRAPHY.unitPt,
    }),
    elements: Object.freeze(elements),
    dual: DUAL,
    dualRightOffset: 32,
    rules: RULES,
    furniture: Object.freeze({
      speechContinued: false,
      speakerContinued: false,
      sceneContinued: false,
      scenesNumbered: false,
      sceneNumberSides: "none",
      scenesLettered: false,
      castLists: false,
      speechesNumbered: false,
      moreText: "(MORE)",
      contdText: " (CONT'D)",
      continuedTopText: "CONTINUED:",
      continuedFootText: "(CONTINUED)",
      breakMark: "* * *",
    }),
    typography: BOOK_SERIF_TYPOGRAPHY,
    ...(options.rectoChapters === true ? { rectoChapters: true } : {}),
  });
}
