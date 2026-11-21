// Fitting generated text so each fixed passage starts the page it must, and a locked run fills exactly its pages.
import type { FormatId } from "@manent/schema";
import type { ProductionState } from "@manent/sync-protocol";
import type { SeedBlock } from "../content/markup.ts";
import type { Rng } from "../seed/rng.ts";
import type { StyleGuide } from "./guide.ts";

export interface SeedLayout {
  format: FormatId;
  /** The script settings that shape the page ("script.paper", "script.sceneContinued" …). */
  settings: Readonly<Record<string, unknown>>;
  /** The lock table of a locked script; null when unlocked. */
  anchors: ProductionState["anchors"] | null;
}

/** The server measures; the demo decides. */
export interface PageMeter {
  /** Each page's label and the index of its first block; a block split across pages counts on the page it starts. */
  pages(
    blocks: readonly SeedBlock[],
    layout: SeedLayout,
  ): Promise<readonly { label: string; blockIndex: number }[]>;
}

/** Indices into the whole document. */
export interface FitRange {
  generated: readonly [number, number];
  mustStart: { page: string; blockIndex: number } | null;
}

/** The blocks from one locked start to the next, and the pages they must fill ("21", "21A", "21B"). */
export interface APageRun {
  firstBlock: number;
  lastBlock: number;
  labels: readonly string[];
}

/** `totals[0].layout` is the one the ranges are measured in. */
export async function fitToPages(
  blocks: readonly SeedBlock[],
  _ranges: readonly FitRange[],
  _options: {
    meter: PageMeter;
    guide: StyleGuide;
    rng: Rng;
    used: Set<string>;
    totals: readonly { layout: SeedLayout; pages: number }[];
  },
): Promise<SeedBlock[]> {
  return [...blocks];
}

export async function fitAPages(
  blocks: readonly SeedBlock[],
  _run: APageRun,
  _options: {
    meter: PageMeter;
    layout: SeedLayout;
    guide: StyleGuide;
    rng: Rng;
    used: Set<string>;
    fixed: ReadonlySet<number>;
  },
): Promise<SeedBlock[]> {
  return [...blocks];
}
